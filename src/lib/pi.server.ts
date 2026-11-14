// The one file that imports the Pi SDK (https://github.com/earendil-works/pi). The rest of Motif
// talks to the ProviderRuntime interface, so the SDK can be upgraded or replaced here alone.
//
// Only the SDK's credential and model layer (ModelRuntime) is used: provider sign-ins, API keys,
// the model catalog and plain text completion. No agent session is created, so nothing here lets
// a model read files or run commands.

import { randomUUID } from "node:crypto";

import {
  InMemoryCredentialStore,
  ModelsError,
  type AuthEvent,
  type AuthPrompt,
} from "@earendil-works/pi-ai";
import { registerLazyOAuthFlows } from "@earendil-works/pi-ai/lazy-oauth";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import type { AiFailure, KeyProblem, LinkModel, SignInKind } from "./account-link";
import type {
  KeyCheck,
  ProviderRuntime,
  SignInEvent,
  SignInInteraction,
  SignInPolicy,
  SignInQuestion,
} from "./account-link.server";

// The production build bundles the SDK into the server. By default the SDK finds its sign-in
// flows through a file path, which a bundle no longer has; this makes it load the bundled copies.
registerLazyOAuthFlows();

// Sign in with ChatGPT sends OpenAI an ID for the installation that asks. This one lasts as long
// as the server process.
const installationId = randomUUID();

/** The name Motif gives when a provider's sign-in asks who is connecting. */
const AGENT_NAME = "Motif";

// The SDK's Google adapter refuses a caller-supplied fetch, so the HTTP status of its failures is
// not observed and they are reported as plain failures.
const APIS_WITHOUT_CUSTOM_FETCH = new Set(["google-generative-ai"]);

function toQuestion(prompt: AuthPrompt): SignInQuestion {
  return {
    // The policy decides whether a manual_code question may be shown; the type does not carry it.
    kind: prompt.type as SignInQuestion["kind"],
    message: prompt.message,
    ...(prompt.type !== "select" && prompt.placeholder ? { placeholder: prompt.placeholder } : {}),
    ...(prompt.type === "select"
      ? {
          options: prompt.options.map(({ id, label, description }) => ({
            id,
            label,
            ...(description ? { description } : {}),
          })),
        }
      : {}),
    ...(prompt.signal ? { signal: prompt.signal } : {}),
  };
}

function toEvent(event: AuthEvent): SignInEvent {
  if (event.type === "auth_url") return { kind: "url", url: event.url };
  if (event.type === "device_code") {
    return { kind: "code", value: event.userCode, url: event.verificationUri };
  }
  return { kind: "message", message: event.message };
}

function reasonFor(status: number | null): AiFailure {
  if (status === 401 || status === 403) return "rejected";
  if (status === 402 || status === 429) return "limited";
  return "failed";
}

const UNREACHABLE =
  "Motif's server could not reach the provider. Check the server's internet connection, then try again.";

/**
 * Whether a request got no answer at all. Node's fetch rejects with the message "fetch failed"
 * when the host cannot be found or the connection is refused or dropped, and the SDK passes that
 * on, sometimes wrapped in an error of its own.
 */
function neverReached(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth += 1) {
    if (cause.message === "fetch failed") return true;
    cause = cause.cause;
  }
  return false;
}

/**
 * How Motif answers the questions a provider's sign-in asks, per way in.
 *
 * The SDK asks the `openai-codex` sign-in which way in to take, and asks the browser way in for a
 * pasted redirect URL when the browser's redirect does not arrive. Neither question is one a
 * Motif user should ever see: the user already chose by clicking Connect, and the web app cannot
 * receive a redirect at all.
 */
const BUILT_IN_POLICY: Record<SignInKind, SignInPolicy> = {
  device_code: { choices: [{ match: /login method/i, answer: "device_code" }] },
  browser: {},
};

/**
 * The decisions every build must make, plus the caller's.
 *
 * The device-code answer is not negotiable: without it the SDK asks the user which way in to take,
 * which is the technical choice this exists to remove. Whether the paste field may be shown is the
 * caller's, because it depends on whether the server and the browser are on one machine.
 */
function mergePolicy(base: SignInPolicy, given: SignInPolicy): SignInPolicy {
  return {
    choices: [...(given.choices ?? []), ...(base.choices ?? [])],
    allow: (kind) => (given.allow ?? base.allow)?.(kind) ?? true,
  };
}

/**
 * Answers one question from a provider's sign-in.
 *
 * Only the automatic answers are settled here. Everything else goes to the pop-up, which is also
 * where a question Motif refuses is turned away: that decision belongs to the layer that knows
 * whether this build may show it, and it should produce the one explanation the user reads.
 */
function answer(
  policy: SignInPolicy,
  interaction: SignInInteraction,
  prompt: AuthPrompt,
): Promise<string> {
  const chosen = policy.choices?.find((choice) => choice.match.test(prompt.message));
  return chosen ? Promise.resolve(chosen.answer) : interaction.ask(toQuestion(prompt));
}

/**
 * Where each provider answers "does this key work?".
 *
 * The SDK has no such call: `checkAuth` reports which credential *would* be used, not whether the
 * provider accepts it. So each provider is asked its own cheapest question. All three answer 401
 * for a bad key and list the models the key can reach, so the check and the catalogue are one
 * request.
 */
const VALIDATION_URL: Record<string, string> = {
  anthropic: "https://api.anthropic.com/v1/models?limit=100",
  openai: "https://api.openai.com/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  // OpenCode's Console and Go gateways both list what the key may call; Go needs its own path.
  opencode: "https://opencode.ai/inference/v1/models",
  "opencode-go": "https://opencode.ai/inference/go/v1/models",
};

/** OpenRouter's catalogue needs no key, so a key must be checked against the endpoint that does. */
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

/** Chat model ids that are not chat models, so they stay out of the picker. */
const NOT_CHAT = /(?:^|\/)(?:whisper|tts|dall-e|embedding|text-embedding|omni-moderation|image)/i;

function providerHeaders(providerId: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  // Anthropic's key header is its own, and it wants its API version pinned.
  if (providerId === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    delete headers["Authorization"];
  }
  return headers;
}

/** Reads whatever shape a provider lists models in, keeping only the fields the pop-up uses. */
function readCatalogue(providerId: string, body: unknown): LinkModel[] {
  const list =
    (body as { data?: unknown; models?: unknown })?.data ?? (body as { models?: unknown })?.models;
  if (!Array.isArray(list)) return [];
  const models: LinkModel[] = [];
  for (const entry of list) {
    const item = entry as {
      id?: unknown;
      name?: unknown;
      display_name?: unknown;
      architecture?: { input_modalities?: unknown };
      pricing?: { prompt?: unknown; completion?: unknown };
    };
    const id = typeof item.id === "string" ? item.id : undefined;
    if (!id || (providerId === "openai" && NOT_CHAT.test(id))) continue;
    // OpenRouter publishes input modalities and prices per model; the others do not, and their
    // models are decided by the SDK's own catalogue further down.
    const modalities = Array.isArray(item.architecture?.input_modalities)
      ? item.architecture.input_modalities.filter(
          (m): m is "text" | "image" => m === "text" || m === "image",
        )
      : undefined;
    const free =
      id.endsWith(":free") ||
      (item.pricing !== undefined &&
        String(item.pricing?.prompt ?? "") === "0" &&
        String(item.pricing?.completion ?? "") === "0");
    models.push({
      id,
      name:
        (typeof item.display_name === "string" && item.display_name) ||
        (typeof item.name === "string" && item.name) ||
        id,
      ...(modalities?.length ? { input: modalities } : {}),
      ...(free ? { free: true } : {}),
    });
  }
  return models;
}

/** Asks a provider whether `apiKey` works, without storing it anywhere. */
async function checkKey(providerId: string, apiKey: string): Promise<KeyCheck> {
  const url = VALIDATION_URL[providerId];
  if (!url) return { ok: true, models: [] };

  const ask = async (target: string): Promise<Response> =>
    fetch(target, {
      headers: providerHeaders(providerId, apiKey),
      signal: AbortSignal.timeout(15_000),
    });

  let response: Response;
  try {
    // OpenCode lists models without looking at the key, so its key check asks a different
    // endpoint that does; the catalogue is then read from the list.
    response = providerId === "openrouter" ? await ask(OPENROUTER_KEY_URL) : await ask(url);
  } catch (error) {
    if (neverReached(error) || error instanceof Error) return { ok: false, problem: "unreachable" };
    return { ok: false, problem: "failed" };
  }

  if (response.status === 401 || response.status === 403) {
    // Drain the body so the socket is released.
    await response.body?.cancel().catch(() => {});
    return { ok: false, problem: "rejected" };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, problem: "failed" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, problem: "failed" };
  }

  if (providerId === "openrouter") {
    // The key endpoint also reports today's free-model allowance, which is the number a free-tier
    // user actually hits. Left in the check's `detail` so the pop-up can say it.
    const remaining = (body as { data?: { free_model_daily_requests?: { remaining?: unknown } } })
      ?.data?.free_model_daily_requests?.remaining;
    const detail =
      typeof remaining === "number" ? `Free models: ${remaining} requests left today.` : undefined;
    // The key is good; the catalogue comes from the public list, which anyone may read.
    const catalogue = await ask(url).catch(() => undefined);
    const list = catalogue?.ok ? await catalogue.json().catch(() => undefined) : undefined;
    return { ok: true, models: readCatalogue(providerId, list), ...(detail ? { detail } : {}) };
  }
  return { ok: true, models: readCatalogue(providerId, body) };
}

/** A Pi runtime for one visitor. Its credentials live in this object and nowhere else. */
export async function createPiRuntime(): Promise<ProviderRuntime> {
  const runtime = await ModelRuntime.create({
    // Not the SDK's default store, the file auth.json: that store expands the keys it reads, so
    // a stored key starting with "!" runs as a shell command and "$NAME" reads the environment.
    credentials: new InMemoryCredentialStore(),
    // No models.json from the server's home directory, and no catalog download from pi.dev.
    modelsPath: null,
    allowModelNetwork: false,
  });

  return {
    async checkApiKey(providerId, apiKey) {
      return checkKey(providerId, apiKey);
    },

    async linkApiKey(providerId, apiKey) {
      let asked = false;
      await runtime.login(providerId, "api_key", {
        prompt: async (prompt) => {
          if (asked || prompt.type !== "secret") {
            throw new Error(`Unexpected question while storing an API key: ${prompt.type}`);
          }
          asked = true;
          return apiKey;
        },
        notify: () => {},
      });
    },

    async signIn(providerId, interaction, options) {
      // The caller's policy wins: it is the one that knows whether this build may show a paste
      // field. The built-in one covers what every build must do (answer the method question).
      const policy = mergePolicy(BUILT_IN_POLICY[options.kind], options.policy);
      try {
        await runtime.login(
          providerId,
          "oauth",
          {
            signal: interaction.signal,
            prompt: (prompt) => answer(policy, interaction, prompt),
            notify: (event) => interaction.notify(toEvent(event)),
          },
          // `agentName` names Motif on the browser sign-in's page; `getDeviceId` is the
          // installation UUID that sign-in needs. The device-code kind uses neither.
          { agentName: AGENT_NAME, getDeviceId: () => installationId },
        );
      } catch (error) {
        // The pop-up shows this message, and "fetch failed" tells a visitor nothing.
        if (neverReached(error)) throw new Error(UNREACHABLE, { cause: error });
        throw error;
      }
    },

    async unlink(providerId) {
      await runtime.logout(providerId);
    },

    async linked() {
      return (await runtime.listCredentials()).map((credential) => ({
        providerId: credential.providerId,
        method: credential.type === "oauth" ? "sign_in" : "api_key",
      }));
    },

    async models(providerId) {
      // `input` is the SDK's per-model modality list; it is what the vision gate reads.
      return (await runtime.getAvailable(providerId)).map(({ id, name, input }) => ({
        id,
        name,
        ...(Array.isArray(input) ? { input: [...input] } : {}),
      }));
    },

    async complete(providerId, modelId, prompt) {
      const model = runtime.getModel(providerId, modelId);
      const stored = (await runtime.listCredentials()).some((c) => c.providerId === providerId);
      // Without a stored credential the SDK falls back to the server's own environment
      // (OPENAI_API_KEY and the like), and every visitor would spend the owner's account.
      if (!model || !stored) return { ok: false, reason: "not_linked", status: null };

      try {
        // Refreshes an expired sign-in, so that a revoked one is told apart from other failures.
        await runtime.getAuth(model);
      } catch (error) {
        // A renewal the provider never received says nothing about the account: the link stays
        // good, and asking the visitor to link again would be wrong.
        const refused =
          error instanceof ModelsError && error.code === "oauth" && !neverReached(error);
        return { ok: false, reason: refused ? "rejected" : "failed", status: null };
      }

      const seen: { status: number | null } = { status: null };
      const watchedFetch: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        seen.status = response.status;
        return response;
      };
      const message = await runtime.completeSimple(
        model,
        { messages: [{ role: "user", content: prompt, timestamp: Date.now() }] },
        APIS_WITHOUT_CUSTOM_FETCH.has(model.api) ? {} : { fetch: watchedFetch },
      );
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        // The provider's own message is dropped: it can repeat part of the key.
        return { ok: false, reason: reasonFor(seen.status), status: seen.status };
      }
      const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
      return { ok: true, text };
    },
  };
}
