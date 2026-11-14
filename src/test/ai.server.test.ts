// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { AccountLinks, type Completion, type ProviderRuntime } from "@/lib/account-link.server";
import { AiError, ask, explainAiFailure } from "@/lib/ai.server";

const SHARED = Symbol.for("motif.accountLinks");
const scope = globalThis as { [SHARED]?: AccountLinks };

/** Installs the server's links with a provider library that answers every prompt with `reply`. */
function useLinks(reply: (prompt: string, model: string) => Completion) {
  const runtime: ProviderRuntime = {
    linkApiKey: async () => {},
    signIn: async () => {},
    unlink: async () => {},
    linked: async () => [{ providerId: "opencode", method: "api_key" }],
    models: async () => [{ id: "kimi-k2.7-code", name: "Kimi K2.7 Code" }],
    complete: async (_providerId, modelId, prompt) => reply(prompt, modelId),
  };
  const links = new AccountLinks({ createRuntime: async () => runtime });
  scope[SHARED] = links;
  return links;
}

afterEach(() => {
  delete scope[SHARED];
});

describe("ask", () => {
  it("answers on the account the caller's token names", async () => {
    const links = useLinks((prompt, model) => ({ ok: true, text: `${model} read: ${prompt}` }));
    const { token } = (await links.linkApiKey(null, "opencode", "sk-zen-Qm81TESTKEYq7Lm")).status;

    await expect(ask(token, "Extract a style")).resolves.toBe(
      "kimi-k2.7-code read: Extract a style",
    );
  });

  it("fails as not linked for a caller without a link", async () => {
    useLinks(() => ({ ok: true, text: "never reached" }));

    for (const token of [null, undefined, "made-up-token"]) {
      const error: unknown = await ask(token, "hello").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiError);
      expect(error).toMatchObject({
        reason: "not_linked",
        message: "AI request failed: not_linked",
      });
    }
  });

  it("fails with the reason and the status only", async () => {
    const links = useLinks(() => ({ ok: false, reason: "rejected", status: 401 }));
    const { token } = (await links.linkApiKey(null, "opencode", "sk-zen-Qm81TESTKEYq7Lm")).status;

    const error: unknown = await ask(token, "hello").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({
      reason: "rejected",
      message: "AI request failed: rejected, HTTP 401",
    });
  });
});

describe("explainAiFailure", () => {
  const fallback = "The AI couldn't finish this edit. Try again.";

  it("asks for a link when none exists, and offers the pop-up", () => {
    expect(explainAiFailure(new AiError("not_linked", null), fallback)).toEqual({
      error: "Link an AI account to use this.",
      relink: true,
    });
  });

  it("points at the account when the provider turned the request down", () => {
    expect(explainAiFailure(new AiError("rejected", 401), fallback)).toEqual({
      error:
        "Your linked AI account turned the request down. Link it again, or pick another model.",
      relink: true,
    });
  });

  it("does not offer the pop-up for a quota or rate limit", () => {
    expect(explainAiFailure(new AiError("limited", 429), fallback)).toEqual({
      error: "Your linked AI account is out of quota or rate limited. Try again later.",
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
