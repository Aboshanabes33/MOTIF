// Connection manager on the server. Owns the principal's connected AI providers: status,
// validation, selection, disconnect and completion. Credentials live only in the encrypted vault
// (connection-vault.server.ts); this file never prints, logs or returns one.
//
// Methods take an explicit principal id. HTTP handlers resolve it from the signed HttpOnly cookie
// (principal.server.ts) and pass it in; tests pass it directly.

import { createHash, randomBytes } from "node:crypto";

import {
  acceptsImages,
  KEY_WORDING,
  providerById,
  providerViews,
  type AiFailure,
  type ConnectionMethod,
  type KeyProblem,
  type LinkModel,
  type LinkResult,
  type LinkStatus,
  type ProviderId,
  type ProviderView,
} from "./provider-registry";
import { getRequest } from "@tanstack/react-start/server";

import {
  consumeFlow,
  deleteConnection,
  getActiveProvider,
  getConnection,
  listConnections,
  listPendingFlows,
  putConnection,
  saveFlow,
  setActiveProvider,
} from "./connection-vault.server";
import { checkApiKey, mergeModels, validKeyShape } from "./provider-validation.server";

export type Completion =
  { ok: true; text: string } | { ok: false; reason: AiFailure; status: number | null };

/** What Motif needs from an AI provider library, for one principal. Pi implements it. */
export interface ProviderRuntime {
  /** Stores an API key for the provider, replacing its earlier credential. */
  linkApiKey(providerId: string, apiKey: string): Promise<void>;
  unlink(providerId: string): Promise<void>;
  /** The providers that hold a credential. */
  linked(): Promise<{ providerId: string; method: ConnectionMethod }[]>;
  /** The models the provider's credential can use, with what each accepts. */
  models(providerId: string): Promise<LinkModel[]>;
  /** Sends one prompt and returns the reply text. Fails without a credential for the provider. */
  complete(providerId: string, modelId: string, prompt: string): Promise<Completion>;
}

export type AccountLinksOptions = {
  createRuntime: (principalId: string) => Promise<ProviderRuntime>;
  now?: () => number;
};

const OAUTH_TTL_MS = 10 * 60 * 1000;

/** Absolute origin for server-side OAuth callbacks: configured first, otherwise this request. */
function publicBaseUrl(): string {
  const configured = process.env["MOTIF_PUBLIC_BASE_URL"]?.replace(/\/+$/, "");
  if (configured) return configured;
  try {
    return new URL(getRequest().url).origin;
  } catch {
    throw new Error(
      "MOTIF_PUBLIC_BASE_URL is required to start OAuth (e.g. https://motif.example.com).",
    );
  }
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export class AccountLinks {
  private readonly createRuntime: (principalId: string) => Promise<ProviderRuntime>;
  private readonly now: () => number;
  /** Runtimes are expensive to create and safe to reuse while their credentials are unchanged. */
  private readonly runtimes = new Map<string, Promise<ProviderRuntime>>();

  constructor(options: AccountLinksOptions) {
    this.createRuntime = options.createRuntime;
    this.now = options.now ?? Date.now;
  }

  private runtime(principalId: string): Promise<ProviderRuntime> {
    let cached = this.runtimes.get(principalId);
    if (!cached) {
      if (this.runtimes.size >= 500) {
        const oldest = this.runtimes.keys().next().value;
        if (oldest) this.runtimes.delete(oldest);
      }
      cached = this.createRuntime(principalId);
      cached.catch(() => this.runtimes.delete(principalId));
      this.runtimes.set(principalId, cached);
    }
    return cached;
  }

  private providerViews(): ProviderView[] {
    return providerViews({ configuredEnv: Object.keys(process.env) });
  }

  async status(principalId: string): Promise<LinkStatus> {
    const providers = this.providerViews();
    const [metadata, active, pending] = await Promise.all([
      listConnections(principalId),
      getActiveProvider(principalId),
      listPendingFlows(principalId),
    ]);
    const accounts = await Promise.all(
      metadata.map(async (meta) => ({
        providerId: meta.providerId,
        method: meta.method,
        status: meta.status,
        model: meta.modelId,
        models: await this.safeModels(principalId, meta.providerId),
        connectedAt: meta.connectedAt,
        updatedAt: meta.updatedAt,
        ...(meta.note ? { note: meta.note } : {}),
      })),
    );
    const activeProviderId = active ?? accounts[0]?.providerId ?? null;
    const account = accounts.find((candidate) => candidate.providerId === activeProviderId) ?? null;
    return {
      accounts,
      account,
      activeProviderId: account ? account.providerId : null,
      providers,
      pendingOAuth: pending[0]
        ? {
            providerId: pending[0].providerId,
            method: "openrouter_pkce",
            message: "Waiting for you to approve the request in your browser.",
            startedAt: pending[0].startedAt,
          }
        : null,
    };
  }

  private async safeModels(principalId: string, providerId: ProviderId): Promise<LinkModel[]> {
    try {
      return await (await this.runtime(principalId)).models(providerId);
    } catch {
      return [];
    }
  }

  async linkApiKey(
    principalId: string,
    providerIdRaw: string,
    apiKey: string,
  ): Promise<LinkResult> {
    const providers = this.providerViews();
    const fail = (error: string): Promise<LinkResult> =>
      this.status(principalId).then((status) => ({ status, error }));
    const provider = providerById(providerIdRaw);
    const method = provider?.methods.find((candidate) => candidate.id === "api_key");
    if (!provider || provider.hidden || !method?.implemented) {
      return fail("That provider cannot be connected with an API key in this build.");
    }
    const providerId = provider.id;
    const key = apiKey.trim();
    if (!validKeyShape(key)) return fail(KEY_WORDING.shape(provider.name));

    const check = await checkApiKey(providerId, key);
    if (!check.ok) {
      if (check.problem === "unreachable" || check.problem === "failed") {
        console.error(
          `Validating an API key for ${providerId} failed (${check.problem}). The key was not stored.`,
        );
      }
      return fail(KEY_WORDING[check.problem](provider.name));
    }

    const runtime = await this.runtime(principalId);
    try {
      await runtime.linkApiKey(providerId, key);
    } catch (error) {
      console.error(
        "Storing a validated API key failed:",
        error instanceof Error ? error.name : error,
      );
      await runtime.unlink(providerId).catch(() => {});
      return fail("MOTIF couldn't store that key. Try again.");
    }

    try {
      const models = mergeModels(await runtime.models(providerId), check.models);
      const chosen =
        models.find((candidate) => candidate.id === provider.defaultModel) ?? models[0];
      if (!chosen) throw new Error("no available model");
      const now = this.now();
      await putConnection(principalId, {
        providerId,
        method: "api_key",
        status: "connected",
        modelId: chosen.id,
        connectedAt: now,
        updatedAt: now,
        ...(check.detail ? { note: check.detail } : {}),
      });
      await setActiveProvider(principalId, providerId);
      return {
        status: await this.status(principalId),
        error: null,
        ...(check.detail ? { note: check.detail } : {}),
      };
    } catch (error) {
      console.error(
        "Finishing an API key connection failed:",
        error instanceof Error ? error.name : error,
      );
      await runtime.unlink(providerId).catch(() => {});
      return fail("MOTIF couldn't open a model on this account. Try again.");
    }
  }

  /** Starts OpenRouter's official BYOAI PKCE flow. XAI/ChatGPT/Copilot have no equivalent exposed flow. */
  async startOAuth(principalId: string, providerIdRaw: string): Promise<LinkResult> {
    const fail = (error: string): Promise<LinkResult> =>
      this.status(principalId).then((status) => ({ status, error }));
    const provider = providerById(providerIdRaw);
    if (provider?.id !== "openrouter") {
      return fail("This provider has no supported OAuth connection in this build.");
    }
    const method = provider.methods.find((candidate) => candidate.id === "openrouter_pkce");
    if (!method?.implemented) {
      return fail(`${provider.name} sign-in is not available. Use an API key instead.`);
    }
    let redirectUri: string;
    try {
      redirectUri = `${publicBaseUrl()}/api/auth/openrouter/callback`;
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : "OAuth is not configured on this server.",
      );
    }
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const state = base64url(randomBytes(32));
    await saveFlow(principalId, {
      state,
      providerId: provider.id,
      method: "openrouter_pkce",
      verifier,
      challenge,
      redirectUri,
      createdAt: this.now(),
      expiresAt: this.now() + OAUTH_TTL_MS,
    });
    const authorize = new URL("https://openrouter.ai/auth");
    authorize.searchParams.set("callback_url", redirectUri);
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("key_label", "MOTIF");
    return {
      status: await this.status(principalId),
      error: null,
      authorizationUrl: authorize.toString(),
    };
  }

  /** Completes the OpenRouter PKCE flow. Called only by the server-side callback route. */
  async completeOpenRouterOAuth(
    principalId: string,
    code: string,
    state: string,
  ): Promise<{ ok: true; providerId: ProviderId } | { ok: false; error: string }> {
    const flow = await consumeFlow(principalId, state);
    if (!flow) return { ok: false, error: "invalid_state" };
    if (flow.method !== "openrouter_pkce" || flow.providerId !== "openrouter") {
      return { ok: false, error: "invalid_state" };
    }
    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: flow.verifier,
          code_challenge_method: "S256",
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return { ok: false, error: "unreachable" };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return {
        ok: false,
        error: response.status === 400 || response.status === 401 ? "rejected" : "failed",
      };
    }
    let key: unknown;
    try {
      key = (await response.json())?.key;
    } catch {
      return { ok: false, error: "failed" };
    }
    if (typeof key !== "string" || !validKeyShape(key)) return { ok: false, error: "failed" };

    // The minted key is validated exactly like a hand-entered key, then stored encrypted.
    const check = await checkApiKey("openrouter", key);
    if (!check.ok) return { ok: false, error: check.problem };
    try {
      const runtime = await this.runtime(principalId);
      await runtime.linkApiKey("openrouter", key);
      const models = mergeModels(await runtime.models("openrouter"), check.models);
      const chosen = models.find((candidate) => candidate.id === "openrouter/auto") ?? models[0];
      if (!chosen) throw new Error("no available model");
      const now = this.now();
      await putConnection(principalId, {
        providerId: "openrouter",
        method: "openrouter_pkce",
        status: "connected",
        modelId: chosen.id,
        connectedAt: now,
        updatedAt: now,
      });
      await setActiveProvider(principalId, "openrouter");
      return { ok: true, providerId: "openrouter" };
    } catch {
      const runtime = await this.runtime(principalId).catch(() => null);
      await runtime?.unlink("openrouter").catch(() => {});
      return { ok: false, error: "failed" };
    }
  }

  async activate(principalId: string, providerIdRaw: string): Promise<LinkResult> {
    const provider = providerById(providerIdRaw);
    const fail = (error: string): Promise<LinkResult> =>
      this.status(principalId).then((status) => ({ status, error }));
    if (!provider || !(await getConnection(principalId, provider.id))) {
      return fail("Connect that provider before selecting it.");
    }
    await setActiveProvider(principalId, provider.id);
    return { status: await this.status(principalId), error: null };
  }

  async chooseModel(
    principalId: string,
    providerIdRaw: string,
    model: string,
    needsVision = false,
  ): Promise<LinkResult> {
    const fail = (error: string): Promise<LinkResult> =>
      this.status(principalId).then((status) => ({ status, error }));
    const provider = providerById(providerIdRaw);
    const connection = provider ? await getConnection(principalId, provider.id) : undefined;
    if (!provider || !connection) return fail("Connect that provider before choosing a model.");
    const models = await this.safeModels(principalId, provider.id);
    const chosen = models.find((candidate) => candidate.id === model);
    if (!chosen) return fail("That model isn't available on this account.");
    if (needsVision && !acceptsImages(chosen)) {
      return fail(
        `${chosen.name} works on text only. Choose a model that accepts images, or send the prompt without one.`,
      );
    }
    const now = this.now();
    await putConnection(principalId, {
      ...connection,
      modelId: model,
      status: "connected",
      updatedAt: now,
    });
    await setActiveProvider(principalId, provider.id);
    return { status: await this.status(principalId), error: null };
  }

  /** Forgets this principal's credential for a provider. It does not revoke the key at the provider. */
  async unlink(principalId: string, providerIdRaw: string): Promise<LinkResult> {
    const provider = providerById(providerIdRaw);
    if (!provider) return { status: await this.status(principalId), error: null };
    try {
      await (await this.runtime(principalId)).unlink(provider.id);
    } catch {
      // The metadata must still go, so a broken provider cannot leave a ghost connection.
    }
    await deleteConnection(principalId, provider.id);
    const remaining = (await listConnections(principalId))[0];
    const active = await getActiveProvider(principalId);
    if (!active) await setActiveProvider(principalId, remaining?.providerId ?? null);
    this.runtimes.delete(principalId);
    return { status: await this.status(principalId), error: null };
  }

  /**
   * Sends one prompt to the active connection. `images` counts pictures travelling with it; a
   * text-only model is refused before the request rather than answering badly.
   */
  async complete(principalId: string, prompt: string, images = 0): Promise<Completion> {
    const configured = await getActiveProvider(principalId);
    const connections = await listConnections(principalId);
    const providerId = configured ?? connections[0]?.providerId ?? null;
    const connection = providerId ? await getConnection(principalId, providerId) : undefined;
    if (!providerId || !connection) {
      return { ok: false, reason: "not_linked", status: null };
    }
    if (images > 0) {
      const models = await this.safeModels(principalId, providerId);
      const chosen = models.find((candidate) => candidate.id === connection.modelId);
      if (chosen && !acceptsImages(chosen)) {
        return { ok: false, reason: "no_vision", status: null };
      }
    }
    const runtime = await this.runtime(principalId);
    return runtime.complete(providerId, connection.modelId, prompt);
  }
}

const SHARED = Symbol.for("motif.accountLinks");

/** The connection manager of this server process, shared across requests. */
export function accountLinks(): AccountLinks {
  const scope = globalThis as { [SHARED]?: AccountLinks };
  return (scope[SHARED] ??= new AccountLinks({
    createRuntime: async (principalId) =>
      (await import("./pi.server")).createPiRuntime(principalId),
  }));
}
