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

import type { AiFailure } from "./account-link";
import type { ProviderRuntime, SignInEvent, SignInQuestion } from "./account-link.server";

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
    kind: prompt.type,
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

    async signIn(providerId, interaction) {
      try {
        await runtime.login(
          providerId,
          "oauth",
          {
            signal: interaction.signal,
            prompt: (prompt) => interaction.ask(toQuestion(prompt)),
            notify: (event) => interaction.notify(toEvent(event)),
          },
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
      return (await runtime.getAvailable(providerId)).map(({ id, name }) => ({ id, name }));
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
