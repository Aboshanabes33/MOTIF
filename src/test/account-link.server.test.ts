// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountLinks, type Completion, type ProviderRuntime } from "@/lib/account-link.server";
import type { LinkModel } from "@/lib/provider-registry";
import { credentialStoreFor } from "@/lib/connection-vault.server";

import { json, principal, createTempVault } from "./test-vault";

const KEY = "sk-zen-Qm81TESTKEYq7Lm0000";
const OR_KEY = "sk-or-v1-" + "a".repeat(64);
const MODELS: Record<string, LinkModel[]> = {
  openai: [{ id: "gpt-6.1-sol", name: "GPT-6.1 Sol", input: ["text", "image"] }],
  anthropic: [
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", input: ["text", "image"] },
    { id: "claude-haiku-4-6", name: "Claude Haiku 4.6", input: ["text"] },
  ],
  openrouter: [
    { id: "openrouter/auto", name: "OpenRouter Auto", input: ["text", "image"], free: true },
    {
      id: "google/gemma-4-31b-it:free",
      name: "Gemma 4 31B (free)",
      input: ["text", "image"],
      free: true,
    },
  ],
  xai: [{ id: "grok-4.7", name: "Grok 4.7", input: ["text", "image"] }],
  google: [{ id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", input: ["text", "image"] }],
  opencode: [{ id: "kimi-k2.7-code", name: "Kimi K2.7 Code" }],
  "opencode-go": [{ id: "kimi-k3.1-pro", name: "Kimi K3.1 Pro" }],
};

type Sent = { url: string; authorization: string | null; body: unknown };

function catalogue(models: LinkModel[]) {
  return {
    data: models.map((model) => ({
      id: model.id,
      display_name: model.name,
      name: model.name,
      input_modalities: model.input,
      pricing: model.free ? { prompt: "0", completion: "0" } : undefined,
    })),
  };
}

/** The fake provider network. Existing per-provider mode endpoint handlers may override it. */
function defaultNetwork({ url }: Sent): Response {
  if (url === "https://openrouter.ai/api/v1/key") {
    return json({ data: { free_model_daily_requests: { remaining: 43 } } });
  }
  if (url === "https://openrouter.ai/api/v1/auth/keys") return json({ key: OR_KEY });
  if (url === "https://openrouter.ai/api/v1/models") return json(catalogue(MODELS["openrouter"]!));
  if (url === "https://api.openai.com/v1/models") return json(catalogue(MODELS["openai"]!));
  if (url.startsWith("https://api.anthropic.com/v1/models"))
    return json(catalogue(MODELS["anthropic"]!));
  if (url === "https://api.x.ai/v1/language-models") return json(catalogue(MODELS["xai"]!));
  if (url === "https://generativelanguage.googleapis.com/v1beta/models") {
    return json({
      models: (MODELS["google"] ?? []).map((model) => ({
        name: `models/${model.id}`,
        displayName: model.name,
        inputModalities: model.input,
        supportedGenerationMethods: ["generateContent"],
      })),
    });
  }
  if (url === "https://opencode.ai/inference/v1/models")
    return json(catalogue(MODELS["opencode"]!));
  if (url === "https://opencode.ai/inference/go/v1/models")
    return json(catalogue(MODELS["opencode-go"]!));
  return json({ error: { message: "unstubbed test URL" } }, 404);
}

function fakeRuntime(principalId: string, models = MODELS) {
  const store = credentialStoreFor(principalId);
  const stored = new Map<string, { method: "api_key" | "openrouter_pkce"; secret: string }>();
  const runtime: ProviderRuntime = {
    async linkApiKey(providerId, apiKey) {
      await store.modify(providerId, async () => ({ type: "api_key", key: apiKey }));
      stored.set(providerId, { method: "api_key", secret: apiKey });
    },
    async unlink(providerId) {
      await store.delete(providerId);
      stored.delete(providerId);
    },
    async linked() {
      return [...stored].map(([providerId, { method }]) => ({ providerId, method }));
    },
    async models(providerId) {
      return models[providerId] ?? [];
    },
    async complete(providerId, modelId, prompt): Promise<Completion> {
      const credential = await store.read(providerId);
      if (!credential) return { ok: false, reason: "not_linked", status: null };
      return { ok: true, text: `${providerId}/${modelId}: ${prompt}` };
    },
  };
  return { runtime, stored };
}

function setup(options: { respond?: (sent: Sent) => Response | Promise<Response> } = {}) {
  const vault = createTempVault();
  const runtimes: ReturnType<typeof fakeRuntime>[] = [];
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
      const raw = init?.body;
      const body = typeof raw === "string" ? JSON.parse(raw) : raw;
      const request = { url, authorization: headers.get("authorization"), body };
      sent.push(request);
      if (options.respond) return options.respond(request);
      return defaultNetwork(request);
    }),
  );
  const links = new AccountLinks({
    createRuntime: async (principalId) => {
      const made = fakeRuntime(principalId);
      runtimes.push(made);
      return made.runtime;
    },
  });
  return { links, sent, runtimes, vault };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("linking with an API key", () => {
  it("shows only officially supported methods and never ChatGPT sign-in", async () => {
    const { links, vault } = setup();

    const status = await links.status(principal("q"));

    const providers = Object.fromEntries(
      status.providers.map((provider) => [provider.id, provider]),
    );
    expect(
      providers["openai"]?.methods.some((method) => method.label === "Use an OpenAI API key"),
    ).toBe(true);
    expect(providers["openrouter"]?.methods.map((method) => method.id)).toEqual([
      "api_key",
      "openrouter_pkce",
    ]);
    expect(providers["anthropic"]?.methods.some((method) => method.label.includes("API key"))).toBe(
      true,
    );
    expect(status.providers.some((provider) => provider.id === "openai-codex")).toBe(false);
    expect(
      status.providers.find((provider) => provider.id === "github-copilot")?.methods[0]?.available,
    ).toBe(false);

    await vault.cleanup();
  });

  it("checks the key and stores it without exposing it in status", async () => {
    const { links, runtimes, vault } = setup();

    const { status, error, note } = await links.linkApiKey(principal("a"), "openrouter", KEY);

    expect(error).toBeNull();
    expect(note).toBe("Free models: 43 requests left today.");
    expect(status.account).toMatchObject({
      providerId: "openrouter",
      method: "api_key",
      model: "openrouter/auto",
    });
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(runtimes[0]!.stored.get("openrouter")).toEqual({ method: "api_key", secret: KEY });

    await vault.cleanup();
  });

  it("refuses a provider-rejected key and stores nothing", async () => {
    const { links, runtimes, vault } = setup({
      respond: () => json({ error: { message: "no" } }, 401),
    });

    const { status, error } = await links.linkApiKey(principal("b"), "anthropic", KEY);

    expect(error).toMatch(/didn't accept/);
    expect(status.accounts).toEqual([]);
    expect(runtimes).toHaveLength(0);

    await vault.cleanup();
  });

  it("keeps the existing connection when a replacement key is refused", async () => {
    let accept = true;
    const { links, vault } = setup({
      respond: ({ url }) => {
        if (accept) return defaultNetwork({ url, authorization: null, body: undefined });
        return json({ error: { message: "no" } }, 401);
      },
    });
    const owner = principal("c");
    const first = await links.linkApiKey(owner, "opencode", KEY);
    accept = false;

    const second = await links.linkApiKey(owner, "opencode", KEY);

    expect(first.error).toBeNull();
    expect(second.error).toMatch(/didn't accept/);
    expect((await links.status(owner)).account?.providerId).toBe("opencode");

    await vault.cleanup();
  });

  it("keeps each browser principal apart", async () => {
    const { links, vault } = setup();
    const anna = principal("a");
    const omar = principal("b");

    await links.linkApiKey(anna, "opencode", KEY);

    expect((await links.status(anna)).account?.providerId).toBe("opencode");
    expect((await links.status(omar)).account).toBeNull();

    await vault.cleanup();
  });

  it("deletes the stored credential on disconnect", async () => {
    const { links, runtimes, vault } = setup();
    const owner = principal("d");
    await links.linkApiKey(owner, "opencode", KEY);

    const result = await links.unlink(owner, "opencode");

    expect(result.status.accounts).toEqual([]);
    expect(runtimes[0]!.stored.has("opencode")).toBe(false);

    await vault.cleanup();
  });

  it("refuses to choose a text-only model for an image prompt", async () => {
    const { links, vault } = setup();
    const owner = principal("e");
    await links.linkApiKey(owner, "anthropic", KEY);
    // The default model can see, so this request may proceed.
    await expect(links.complete(owner, "describe", 1)).resolves.toEqual({
      ok: true,
      text: "anthropic/claude-sonnet-4-6: describe",
    });

    await links.chooseModel(owner, "anthropic", "claude-haiku-4-6");
    const blind = await links.complete(owner, "describe", 1);

    expect(blind).toEqual({ ok: false, reason: "no_vision", status: null });
    expect(
      (await links.chooseModel(owner, "anthropic", "claude-sonnet-4-6", true)).error,
    ).toBeNull();

    await vault.cleanup();
  });
});

describe("OpenRouter OAuth (BYOAI PKCE)", () => {
  it("starts only for OpenRouter and returns an authorization URL without the verifier", async () => {
    const { links, vault } = setup();

    const other = await links.startOAuth(principal("f"), "anthropic");
    const started = await links.startOAuth(principal("g"), "openrouter");

    expect(other.error).toMatch(/no supported OAuth/);
    expect(started.error).toBeNull();
    const url = new URL(started.authorizationUrl!);
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_verifier")).toBeNull();

    await vault.cleanup();
  });

  it("exchanges the code, validates the minted key and connects", async () => {
    const { links, runtimes, vault } = setup();
    const owner = principal("h");
    const started = await links.startOAuth(owner, "openrouter");
    const state = new URL(started.authorizationUrl!).searchParams.get("state")!;

    const result = await links.completeOpenRouterOAuth(owner, "auth-code", state);

    expect(result).toEqual({ ok: true, providerId: "openrouter" });
    expect(runtimes[0]!.stored.get("openrouter")).toEqual({
      method: "api_key",
      secret: OR_KEY,
    });
    expect((await links.status(owner)).account).toMatchObject({
      providerId: "openrouter",
      method: "openrouter_pkce",
    });

    await vault.cleanup();
  });

  it("rejects a replayed callback and a wrong state", async () => {
    const { links, vault } = setup();
    const owner = principal("i");
    const started = await links.startOAuth(owner, "openrouter");
    const state = new URL(started.authorizationUrl!).searchParams.get("state")!;

    expect(await links.completeOpenRouterOAuth(owner, "auth-code", "wrong-state")).toEqual({
      ok: false,
      error: "invalid_state",
    });
    expect((await links.completeOpenRouterOAuth(owner, "auth-code", state)).ok).toBe(true);
    expect(await links.completeOpenRouterOAuth(owner, "auth-code", state)).toEqual({
      ok: false,
      error: "invalid_state",
    });

    await vault.cleanup();
  });
});
