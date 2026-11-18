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
  type ConnectionStatus,
  type KeyCheck,
  type ProviderDescriptor,
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
  generationFor,
  listConnections,
  listPendingFlows,
  connect,
  updateConnection,
  type ConnectionMetadata,
  saveFlow,
  setActiveProvider,
} from "./connection-vault.server";
import { reportProviderFailure } from "./provider-events.server";
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
  /** Models supported by this runtime, to intersect with the provider response. */
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
  if (configured) {
    const url = new URL(configured);
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      return url.origin;
    throw new Error("OAuth callback requires HTTPS");
  }
  if (process.env["NODE_ENV"] === "production") throw new Error("OAuth callback not configured");
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
    let callbackAvailable = false;
    try {
      callbackAvailable = Boolean(publicBaseUrl());
    } catch {
      /* API-key methods remain available. */
    }
    return providerViews({ configuredEnv: Object.keys(process.env), callbackAvailable });
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
        status: this.connectionStatus(meta),
        model: meta.modelId,
        models: await this.connectionModels(principalId, meta),
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

  private connectionStatus(meta: ConnectionMetadata) {
    return meta.expiresAt !== undefined && meta.expiresAt <= this.now()
      ? "needs_reconnect"
      : meta.status;
  }

  private async connectionModels(
    principalId: string,
    meta: ConnectionMetadata,
  ): Promise<LinkModel[]> {
    if (this.connectionStatus(meta) === "needs_reconnect") return [];
    if (meta.models) return meta.models;
    // Older vaults didn't persist discovery. Retain their selected model until reconnection.
    return (await (await this.runtime(principalId)).models(meta.providerId)).filter(
      (m) => m.id === meta.modelId,
    );
  }

  private async storeValidated(
    principalId: string,
    provider: ProviderDescriptor,
    method: ConnectionMethod,
    key: string,
    check: Extract<KeyCheck, { ok: true }>,
    generation?: string,
  ): Promise<boolean> {
    const now = this.now();
    if (check.expiresAt !== undefined && check.expiresAt <= now) return false;
    const models = mergeModels(
      await (await this.runtime(principalId)).models(provider.id),
      check.models,
    );
    const chosen = models.find((model) => model.id === provider.defaultModel) ?? models[0];
    if (!chosen) return false;
    return connect(
      principalId,
      key,
      {
        providerId: provider.id,
        method,
        modelId: chosen.id,
        models,
        status: "connected",
        connectedAt: now,
        updatedAt: now,
        ...(check.expiresAt !== undefined ? { expiresAt: check.expiresAt } : {}),
        ...(check.detail ? { note: check.detail } : {}),
      },
      generation,
    );
  }

  async linkApiKey(
    principalId: string,
    providerIdRaw: string,
    apiKey: string,
  ): Promise<LinkResult> {
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

    const generation = await generationFor(principalId, providerId);
    const check = await checkApiKey(providerId, key);
    if (!check.ok) {
      void reportProviderFailure(providerId, "validation", check.problem);
      return fail(KEY_WORDING[check.problem](provider.name));
    }

    try {
      if (!(await this.storeValidated(principalId, provider, "api_key", key, check, generation))) {
        return fail(
          "Couldn’t open a model with that key. Check its access and try connecting again.",
        );
      }
    } catch {
      return fail("MOTIF couldn't finish saving the connection. Try again.");
    }
    return {
      status: await this.status(principalId),
      error: null,
      ...(check.detail ? { note: check.detail } : {}),
    };
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
    } catch {
      return fail("Sign-in is not configured on this server. Use an API key instead.");
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
    code: string | null,
    state: string,
  ): Promise<{ ok: true; providerId: ProviderId } | { ok: false; error: string }> {
    const flow = await consumeFlow(principalId, state);
    if (!flow) return { ok: false, error: "invalid_state" };
    if (flow.method !== "openrouter_pkce" || flow.providerId !== "openrouter") {
      return { ok: false, error: "invalid_state" };
    }
    if (!code) return { ok: false, error: "denied" };
    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
        method: "POST",
        redirect: "error",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: flow.verifier,
          code_challenge_method: "S256",
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      void reportProviderFailure("openrouter", "exchange", "unreachable");
      return { ok: false, error: "unreachable" };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const reason =
        response.status === 402 || response.status === 429
          ? "limited"
          : response.status === 400 || response.status === 401
            ? "rejected"
            : "failed";
      void reportProviderFailure("openrouter", "exchange", reason);
      return { ok: false, error: reason };
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
    if (!check.ok) {
      void reportProviderFailure("openrouter", "validation", check.problem);
      return { ok: false, error: check.problem };
    }
    try {
      if (
        await this.storeValidated(
          principalId,
          providerById("openrouter")!,
          "openrouter_pkce",
          key,
          check,
          flow.generation,
        )
      ) {
        return { ok: true, providerId: "openrouter" };
      }
    } catch {
      // Never expose a provider or storage exception on the callback URL.
    }
    return { ok: false, error: "failed" };
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
    const models = await this.connectionModels(principalId, connection);
    const chosen = models.find((candidate) => candidate.id === model);
    if (!chosen) return fail("That model isn't available on this account.");
    if (needsVision && !acceptsImages(chosen)) {
      return fail(
        `${chosen.name} works on text only. Choose a model that accepts images, or send the prompt without one.`,
      );
    }
    if (!(await updateConnection(principalId, connection, { modelId: model })))
      return fail("The connection changed. Try again.");
    return { status: await this.status(principalId), error: null };
  }

  /** Forgets this principal's credential for a provider. It does not revoke the key at the provider. */
  async unlink(principalId: string, providerIdRaw: string): Promise<LinkResult> {
    const provider = providerById(providerIdRaw);
    if (!provider) return { status: await this.status(principalId), error: null };
    await deleteConnection(principalId, provider.id);
    this.runtimes.delete(principalId);
    return { status: await this.status(principalId), error: null };
  }

  /**
   * Sends one prompt to the active connection. `images` counts pictures travelling with it; a
   * text-only model is refused before the request rather than answering badly.
   */
  async complete(principalId: string, prompt: string, images = 0): Promise<Completion> {
    const providerId =
      (await getActiveProvider(principalId)) ?? (await listConnections(principalId))[0]?.providerId;
    const connection = providerId ? await getConnection(principalId, providerId) : undefined;
    if (!providerId || !connection) {
      return { ok: false, reason: "not_linked", status: null };
    }
    if (this.connectionStatus(connection) === "needs_reconnect")
      return { ok: false, reason: "rejected", status: null };
    if (images > 0) {
      const models = await this.connectionModels(principalId, connection);
      const chosen = models.find((candidate) => candidate.id === connection.modelId);
      if (!acceptsImages(chosen)) {
        return { ok: false, reason: "no_vision", status: null };
      }
    }
    const runtime = await this.runtime(principalId);
    const result = await runtime.complete(providerId, connection.modelId, prompt);
    if (!result.ok) void reportProviderFailure(providerId, "inference", result.reason);
    // A 403 can be model-specific; quota and transport failures are not expired keys.
    const status: ConnectionStatus = result.ok
      ? "connected"
      : result.status === 401
        ? "needs_reconnect"
        : result.reason === "limited"
          ? "limited"
          : "request_failed";
    if (status !== connection.status) await updateConnection(principalId, connection, { status });
    return result;
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
