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
        const expired = error instanceof ModelsError && error.code === "oauth";
        return { ok: false, reason: expired ? "rejected" : "failed", status: null };
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
