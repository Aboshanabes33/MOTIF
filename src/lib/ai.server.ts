// Where the app asks a model for text. Server only: the build refuses to let browser code import
// a *.server.* file (see vite.config.ts). A request runs on the active connection of the signed
// per-browser principal (principal.server.ts); the server has no AI credential of its own.

import { accountLinks } from "./account-link.server";
import type { AiFailure } from "./provider-registry";
import { currentPrincipal } from "./principal.server";

/** An AI request that got no reply. Safe to log: it never repeats what the provider answered. */
export class AiError extends Error {
  constructor(
    readonly reason: AiFailure,
    status: number | null,
  ) {
    super(`AI request failed: ${reason}${status === null ? "" : `, HTTP ${status}`}`);
    this.name = "AiError";
  }
}

/**
 * Sends one prompt to the active connection of the calling principal and returns the reply text.
 * `images` counts pictures travelling with the prompt, so a text-only model is refused first.
 */
export async function ask(prompt: string, images = 0): Promise<string> {
  const result = await accountLinks().complete(currentPrincipal(), prompt, images);
  if (!result.ok) throw new AiError(result.reason, result.status);
  return result.text;
}

const EXPLANATIONS: Record<Exclude<AiFailure, "failed">, string> = {
  not_linked: "Connect an AI provider to use this.",
  no_vision:
    "The model on your connected account can't read images. Pick a model that accepts images, or send this without one.",
  rejected: "Your connected account turned the request down. Reconnect it, or pick another model.",
  limited: "Your connected account is out of quota or rate limited. Try again later.",
};

/** What to tell the user about a failed request, and whether connecting would fix it. */
export function explainAiFailure(
  error: unknown,
  fallback: string,
): { error: string; relink: boolean } {
  const reason = error instanceof AiError ? error.reason : "failed";
  if (reason === "failed") return { error: fallback, relink: false };
  return { error: EXPLANATIONS[reason], relink: reason !== "limited" };
}
