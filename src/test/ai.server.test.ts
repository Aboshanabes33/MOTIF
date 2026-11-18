// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountLinks, type Completion, type ProviderRuntime } from "@/lib/account-link.server";
import { AiError, ask, explainAiFailure } from "@/lib/ai.server";
import { credentialStoreFor } from "@/lib/connection-vault.server";
import { withPrincipal } from "@/lib/principal.server";

import { json, principal, createTempVault } from "./test-vault";

const SHARED = Symbol.for("motif.accountLinks");
const scope = globalThis as { [SHARED]?: AccountLinks };
const OWNER = principal("a");

let vault: ReturnType<typeof createTempVault>;

beforeEach(() => {
  vault = createTempVault();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://opencode.ai/inference/v1/models") {
        return json({ data: [{ id: "kimi-k2.7-code", display_name: "Kimi K2.7 Code" }] });
      }
      return json({ error: { message: "unstubbed" } }, 404);
    }),
  );
});

afterEach(() => {
  delete scope[SHARED];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vault.cleanup();
});

/** Installs the server's connection manager with a provider runtime that answers from memory. */
function useLinks(reply: (prompt: string, model: string) => Completion) {
  scope[SHARED] = new AccountLinks({
    createRuntime: async (principalId) => {
      const store = credentialStoreFor(principalId);
      const runtime: ProviderRuntime = {
        linkApiKey: async (providerId, apiKey) => {
          await store.modify(providerId, async () => ({ type: "api_key", key: apiKey }));
        },
        unlink: async (providerId) => {
          await store.delete(providerId);
        },
        linked: async () => [{ providerId: "opencode", method: "api_key" }],
        models: async () => [{ id: "kimi-k2.7-code", name: "Kimi K2.7 Code" }],
        complete: async (_providerId, modelId, prompt) => reply(prompt, modelId),
      };
      return runtime;
    },
  });
}

describe("ask", () => {
  it("answers on the calling principal's connected account", async () => {
    useLinks((prompt, model) => ({ ok: true, text: `${model} read: ${prompt}` }));
    await scope[SHARED]!.linkApiKey(OWNER, "opencode", "sk-zen-Qm81TESTKEYq7Lm");

    await expect(withPrincipal(OWNER, () => ask("Extract a style"))).resolves.toBe(
      "kimi-k2.7-code read: Extract a style",
    );
  });

  it("fails as not linked for a principal without a connection", async () => {
    useLinks(() => ({ ok: true, text: "never reached" }));

    const error: unknown = await withPrincipal(principal("b"), () =>
      ask("hello").catch((caught: unknown) => caught),
    );

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({
      reason: "not_linked",
      message: "AI request failed: not_linked",
    });
  });

  it("fails with the reason and the status only", async () => {
    useLinks(() => ({ ok: false, reason: "rejected", status: 401 }));
    await scope[SHARED]!.linkApiKey(OWNER, "opencode", "sk-zen-Qm81TESTKEYq7Lm");

    const error: unknown = await withPrincipal(OWNER, () =>
      ask("hello").catch((caught: unknown) => caught),
    );

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({
      reason: "rejected",
      message: "AI request failed: rejected, HTTP 401",
    });
    expect((await scope[SHARED]!.status(OWNER)).account?.status).toBe("needs_reconnect");
    expect(await scope[SHARED]!.complete(OWNER, "do not retry a rejected key")).toEqual({
      ok: false,
      reason: "rejected",
      status: null,
    });
  });
});

describe("explainAiFailure", () => {
  const fallback = "The AI couldn't finish this edit. Try again.";

  it("asks for a connection when none exists, and offers the dialog", () => {
    expect(explainAiFailure(new AiError("not_linked", null), fallback)).toEqual({
      error: "Connect an AI provider to use this.",
      relink: true,
    });
  });

  it("points at the account when the provider turned the request down", () => {
    expect(explainAiFailure(new AiError("rejected", 401), fallback)).toEqual({
      error: "Your connected account turned the request down. Reconnect it, or pick another model.",
      relink: true,
    });
  });

  it("does not offer the dialog for a quota or rate limit", () => {
    expect(explainAiFailure(new AiError("limited", 429), fallback)).toEqual({
      error: "Your connected account is out of quota or rate limited. Try again later.",
      relink: false,
    });
  });

  it("keeps the caller's own message for any other failure", () => {
    expect(explainAiFailure(new AiError("failed", 500), fallback)).toEqual({
      error: fallback,
      relink: false,
    });
    expect(explainAiFailure(new SyntaxError("Unexpected token"), fallback)).toEqual({
      error: fallback,
      relink: false,
    });
  });
});
