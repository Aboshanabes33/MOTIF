// The one file that imports the Pi SDK (https://github.com/earendil-works/pi). The rest of MOTIF
// talks to the ProviderRuntime interface, so the SDK can be upgraded or replaced here alone.
//
// Only the SDK's credential and model layer (ModelRuntime) is used: credential-backed model
// catalogues and plain text completion. No agent session is created, so nothing here lets a model
// read files or run commands. Provider OAuth is owned by MOTIF's own callback route
// (routes/api/auth/$provider/callback.ts); the SDK's CLI sign-in flows are not exposed.

import { ModelsError } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import { credentialStoreFor } from "./connection-vault.server";
import type { AiFailure, ConnectionMethod, LinkModel } from "./provider-registry";
import type { Completion, ProviderRuntime } from "./account-link.server";

// The SDK's Google adapter refuses a caller-supplied fetch, so the HTTP status of its failures is
// not observed and they are reported as plain failures.
const APIS_WITHOUT_CUSTOM_FETCH = new Set(["google-generative-ai"]);

function reasonFor(status: number | null): AiFailure {
  if (status === 401 || status === 403) return "rejected";
  if (status === 402 || status === 429) return "limited";
  return "failed";
}

const UNREACHABLE =
  "MOTIF's server could not reach the provider. Check the server's internet connection, then try again.";

/** Whether a request got no answer at all (Node reports this as an error whose cause is "fetch failed"). */
function neverReached(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth += 1) {
    if (cause.name === "TimeoutError" || cause.message === "fetch failed") return true;
    cause = cause.cause;
  }
  return false;
}

/** A Pi runtime for one principal. Its credentials live in MOTIF's encrypted store. */
export async function createPiRuntime(principalId: string): Promise<ProviderRuntime> {
  const runtime = await ModelRuntime.create({
    // MOTIF's encrypted store, not the SDK's auth.json: the file store expands the keys it reads
    // (a stored key starting with "!" runs as a shell command, "$NAME" reads the environment) and
    // is shared by every caller on the machine. Ours is scoped to this principal and encrypted.
    credentials: credentialStoreFor(principalId),
    // No models.json from the server's home directory, and no catalog download from pi.dev.
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
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

    async unlink(providerId) {
      await runtime.logout(providerId);
    },

    async linked() {
      return (await runtime.listCredentials()).map(
        (credential): { providerId: string; method: ConnectionMethod } => ({
          providerId: credential.providerId,
          method: credential.type === "oauth" ? "openrouter_pkce" : "api_key",
        }),
      );
    },

    async models(providerId): Promise<LinkModel[]> {
      // `input` is the SDK's per-model modality list; it is what the vision gate reads.
      return (await runtime.getAvailable(providerId)).map(({ id, name, input }) => ({
        id,
        name,
        ...(Array.isArray(input) ? { input: [...input] } : {}),
      }));
    },

    async complete(providerId, modelId, prompt) {
      const model = runtime.getModel(providerId, modelId);
      const stored = (await runtime.listCredentials()).some(
        (credential) => credential.providerId === providerId,
      );
      // Without a stored credential the SDK falls back to the server's own environment
      // (OPENAI_API_KEY and the like); MOTIF never spends the owner's account for a visitor.
      if (!model || !stored) return { ok: false, reason: "not_linked", status: null };

      try {
        // Refreshes an expired OAuth credential if the provider rotates tokens; a revoked one is
        // then told apart from other failures.
        await runtime.getAuth(model);
      } catch (error) {
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
      let message;
      try {
        message = await runtime.completeSimple(
          model,
          { messages: [{ role: "user", content: prompt, timestamp: Date.now() }] },
          APIS_WITHOUT_CUSTOM_FETCH.has(model.api) ? {} : { fetch: watchedFetch },
        );
      } catch (error) {
        if (neverReached(error)) {
          console.error(UNREACHABLE);
          return { ok: false, reason: "failed", status: null };
        }
        throw error;
      }
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        // The provider's own message is deliberately dropped: it can repeat part of the key.
        return { ok: false, reason: reasonFor(seen.status), status: seen.status };
      }
      const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
      return { ok: true, text };
    },
  };
}
