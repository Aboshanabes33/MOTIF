// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LinkMethod } from "@/lib/account-link";
import {
  AccountLinks,
  type AccountLinksOptions,
  type ProviderRuntime,
  type SignInInteraction,
  type SignInPolicy,
} from "@/lib/account-link.server";

const KEY = "sk-zen-Qm81TESTKEYq7Lm0000";
const NOTHING = { token: null, account: null, signIn: null };
const CALLBACK = "http://127.0.0.1:1455/auth/callback";

const MODELS: Record<string, { id: string; name: string }[]> = {
  openai: [
    { id: "gpt-6-astra", name: "GPT-6 Astra" },
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
  ],
  "openai-codex": [
    { id: "gpt-6-astra", name: "GPT-6 Astra" },
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
  ],
  opencode: [
    { id: "big-pickle", name: "Big Pickle" },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
  ],
  "opencode-go": [{ id: "kimi-k3.1-pro", name: "Kimi K3.1 Pro" }],
};

type SignInScript = (
  interaction: SignInInteraction,
  options: { kind: "device_code" | "browser"; policy: SignInPolicy },
) => Promise<void>;

/** A provider library that keeps what it is given and answers with what it would have sent. */
function fakeRuntime(signInScript: SignInScript, models = MODELS) {
  const stored = new Map<string, { method: LinkMethod; secret: string }>();
  const runtime: ProviderRuntime = {
    async linkApiKey(providerId, apiKey) {
      stored.set(providerId, { method: "api_key", secret: apiKey });
    },
    async signIn(providerId, interaction, options) {
      await signInScript(interaction, options);
      stored.set(providerId, { method: "sign_in", secret: "access-token-1" });
    },
    async unlink(providerId) {
      stored.delete(providerId);
    },
    async linked() {
      return [...stored].map(([providerId, { method }]) => ({ providerId, method }));
    },
    async models(providerId) {
      return models[providerId] ?? [];
    },
    async complete(providerId, modelId, prompt) {
      const credential = stored.get(providerId);
      if (!credential) return { ok: false, reason: "not_linked", status: null };
      return { ok: true, text: `${providerId}/${modelId} as ${credential.secret}: ${prompt}` };
    },
  };
  return { runtime, stored };
}

function setup(options: Partial<AccountLinksOptions> & { signIn?: SignInScript } = {}) {
  const clock = { now: 1_000_000 };
  const runtimes: ReturnType<typeof fakeRuntime>[] = [];
  const { signIn = async () => {}, ...rest } = options;
  const links = new AccountLinks({
    createRuntime: async () => {
      const made = fakeRuntime(signIn);
      runtimes.push(made);
      return made.runtime;
    },
    now: () => clock.now,
    settleMs: 40,
    ...rest,
  });
  return { links, clock, runtimes };
}

/**
 * A sign-in of the kind the web app uses: it shows one code, opens no address, asks nothing, and
 * finishes when the provider's poll turns over.
 */
function deviceSignIn(finished: number[] = []): SignInScript {
  return async (interaction, { policy }) => {
    const answer = await interaction.ask({
      kind: "select",
      message: "Select OpenAI Codex login method:",
      options: [
        { id: "browser", label: "Browser login (default)" },
        { id: "device_code", label: "Device code login (headless)" },
      ],
    });
    if (answer !== "device_code") throw new Error("Motif asks for the device code.");
    void policy;
    interaction.notify({
      kind: "code",
      value: "WDJB-MJHT",
      url: "https://auth.openai.com/codex/device",
    });
    interaction.notify({ kind: "message", message: "Waiting for you to approve" });
    finished.push(1);
  };
}

/** A sign-in that shows its page and then waits, so only a timeout or a cancel can end it. */
function openSignIn(): SignInScript {
  return async (interaction) => {
    interaction.notify({ kind: "url", url: "https://auth.openai.com/authorize?state=abc" });
    await interaction.ask({ kind: "text", message: "Which workspace?" });
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("linking with an API key", () => {
  it("treats a token it does not know as not linked", async () => {
    const { links, runtimes } = setup();

    for (const token of [null, undefined, "", "made-up-token", 42, { token: "x" }]) {
      expect(await links.status(token)).toEqual(NOTHING);
      expect(await links.complete(token, "hello")).toEqual({
        ok: false,
        reason: "not_linked",
        status: null,
      });
    }
    expect(runtimes).toHaveLength(0);
  });

  it("stores the key and answers with a token that names the link", async () => {
    const { links, runtimes } = setup();

    const { status, error } = await links.linkApiKey(null, "opencode", `  ${KEY}\n`);

    expect(error).toBeNull();
    expect(status.token).toMatch(/^[\w-]{43}$/);
    expect(status.signIn).toBeNull();
    expect(status.account).toEqual({
      providerId: "opencode",
      method: "api_key",
      model: "kimi-k2.7-code",
      models: MODELS["opencode"],
    });
    expect(runtimes[0]?.stored.get("opencode")).toEqual({ method: "api_key", secret: KEY });
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(await links.status(status.token)).toEqual(status);
  });

  it("refuses text that is not a key before any provider library sees it", async () => {
    const { links, runtimes } = setup();
    const notKeys = [
      "!touch /tmp/motif-pwned",
      "$OPENAI_API_KEY",
      "sk-proj-abc$HOME",
      "sk key with spaces",
      "sk-abcd",
      "",
      `sk-${"a".repeat(600)}`,
      "sk-zen-clé-secrète-000",
    ];

    for (const text of notKeys) {
      const { status, error } = await links.linkApiKey(null, "opencode", text);
      expect(error).toMatch(/doesn't look like an API key/);
      expect(status).toEqual(NOTHING);
    }
    expect(runtimes).toHaveLength(0);
  });

  it("keeps each browser's account apart", async () => {
    const { links } = setup();
    const anna = (await links.linkApiKey(null, "opencode", "sk-anna-0000000000")).status.token;
    const omar = (await links.linkApiKey(null, "openai", "sk-omar-0000000000")).status.token;

    expect(anna).not.toBe(omar);
    expect(await links.complete(anna, "hi")).toEqual({
      ok: true,
      text: "opencode/kimi-k2.7-code as sk-anna-0000000000: hi",
    });
    expect(await links.complete(omar, "hi")).toEqual({
      ok: true,
      text: "openai/gpt-6.1-sol as sk-omar-0000000000: hi",
    });
  });

  it("holds one account per link: linking another provider replaces the first", async () => {
    const { links, runtimes } = setup();
    const { token } = (await links.linkApiKey(null, "opencode", KEY)).status;

    const { status } = await links.linkApiKey(token, "opencode-go", "sk-go-00000000000");

    expect(status.token).toBe(token);
    expect(status.account).toMatchObject({ providerId: "opencode-go", model: "kimi-k3.1-pro" });
    expect([...runtimes[0]!.stored.keys()]).toEqual(["opencode-go"]);
    expect(runtimes).toHaveLength(1);
  });

  it("falls back to the provider's first model when its default is not offered", async () => {
    const models = { opencode: [{ id: "glm-5.3", name: "GLM 5.3" }] };
    const links = new AccountLinks({
      createRuntime: async () => fakeRuntime(async () => {}, models).runtime,
    });

    const { status } = await links.linkApiKey(null, "opencode", KEY);

    expect(status.account?.model).toBe("glm-5.3");
  });

  it("reports a provider with no model at all and keeps nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const made = fakeRuntime(async () => {}, {});
    const links = new AccountLinks({ createRuntime: async () => made.runtime });

    const { status, error } = await links.linkApiKey(null, "opencode", KEY);

    expect(error).toBe("Motif couldn't store that key. Try again.");
    expect(status).toEqual(NOTHING);
    expect(made.stored.size).toBe(0);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(KEY);
  });

  it("never logs the key when the provider library fails with it in its message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const made = fakeRuntime(async () => {});
    made.runtime.linkApiKey = async (_providerId, apiKey) => {
      throw new Error(`Credential store rejected ${apiKey}`);
    };
    const links = new AccountLinks({ createRuntime: async () => made.runtime });

    const { status, error } = await links.linkApiKey(null, "opencode", KEY);

    expect(error).toBe("Motif couldn't store that key. Try again.");
    expect(status).toEqual(NOTHING);
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      "Storing an API key failed:",
      "Error: Credential store rejected [key]",
    );
  });

  it("changes the model, but only to one the account offers", async () => {
    const { links } = setup();
    const { token } = (await links.linkApiKey(null, "opencode", KEY)).status;

    const changed = await links.chooseModel(token, "big-pickle");
    const refused = await links.chooseModel(token, "gpt-6.1-sol");

    expect(changed).toMatchObject({ error: null, status: { account: { model: "big-pickle" } } });
    expect(refused.error).toBe("That model isn't available on this account.");
    expect(refused.status.account?.model).toBe("big-pickle");
    expect(await links.complete(token, "hi")).toMatchObject({
      text: `opencode/big-pickle as ${KEY}: hi`,
    });
    expect((await links.chooseModel("made-up-token", "big-pickle")).error).toBe(
      "Link an account first.",
    );
  });

  it("keeps the chosen model when the same provider is linked again", async () => {
    const { links } = setup();
    const { token } = (await links.linkApiKey(null, "opencode", KEY)).status;
    await links.chooseModel(token, "big-pickle");

    const { status } = await links.linkApiKey(token, "opencode", "sk-zen-rotated-0000");

    expect(status.account?.model).toBe("big-pickle");
  });

  it("unlink forgets the credential and the token", async () => {
    const { links, runtimes } = setup();
    const { token } = (await links.linkApiKey(null, "opencode", KEY)).status;

    expect(await links.unlink(token)).toEqual(NOTHING);

    expect(runtimes[0]?.stored.size).toBe(0);
    expect(await links.status(token)).toEqual(NOTHING);
    expect(await links.complete(token, "hi")).toMatchObject({ ok: false, reason: "not_linked" });
  });

  it("forgets a link nobody used for a day", async () => {
    const { links, clock } = setup();
    const { token } = (await links.linkApiKey(null, "opencode", KEY)).status;

    clock.now += 23 * 60 * 60 * 1000;
    expect((await links.status(token)).account).not.toBeNull();
    clock.now += 23 * 60 * 60 * 1000;
    expect((await links.status(token)).account).not.toBeNull();
    clock.now += 25 * 60 * 60 * 1000;

    expect(await links.status(token)).toEqual(NOTHING);
  });

  it("past its limit, drops the link used least recently", async () => {
    const { links, clock } = setup({ maxLinks: 2 });
    const first = (await links.linkApiKey(null, "opencode", KEY)).status.token;
    clock.now += 1000;
    const second = (await links.linkApiKey(null, "opencode", KEY)).status.token;
    clock.now += 1000;
    await links.status(first);
    clock.now += 1000;

    const third = (await links.linkApiKey(null, "opencode", KEY)).status.token;

    expect((await links.status(first)).account).not.toBeNull();
    expect(await links.status(second)).toEqual(NOTHING);
    expect((await links.status(third)).account).not.toBeNull();
  });
});

describe("linking with a provider sign-in", () => {
  it("shows one code and no question, then the account once the provider approves", async () => {
    const finished: number[] = [];
    const { links, runtimes } = setup({ signIn: deviceSignIn(finished) });

    const started = await links.startSignIn(null, "openai-codex");

    expect(started.error).toBeNull();
    const { token, signIn } = started.status;
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(started.status.account).toBeNull();
    // Nothing to answer, nothing to open: the code is the whole of it.
    expect(signIn).toEqual({
      providerId: "openai-codex",
      kind: "device_code",
      code: { value: "WDJB-MJHT", url: "https://auth.openai.com/codex/device" },
      message: "Waiting for you to approve",
    });
    expect(signIn?.prompt).toBeUndefined();
    expect(finished).toEqual([1]);
    expect(runtimes[0]?.stored.get("openai-codex")?.method).toBe("sign_in");
    // The provider collected the result while the code was on screen: the next look says so.
    await vi.waitFor(async () => {
      expect(await links.status(token)).toMatchObject({
        signIn: null,
        account: { providerId: "openai-codex", method: "sign_in" },
      });
    });
    expect(await links.complete(token, "hi")).toMatchObject({ ok: true });
  });

  it("asks nothing of the user: no question reaches the pop-up", async () => {
    // The adapter answers the provider's "how should we sign in?" question itself.
    const kinds: string[] = [];
    const { links } = setup({
      signIn: async (interaction) => {
        await interaction.ask({ kind: "text", message: "Workspace?" });
        kinds.push("asked");
      },
    });

    const { status } = await links.startSignIn(null, "openai-codex");

    // A question the sign-in genuinely needs still reaches the pop-up, and is answerable.
    expect(status.signIn?.prompt).toMatchObject({ kind: "text", message: "Workspace?" });
    await links.answerSignIn(status.token, status.signIn!.prompt!.id, "acme");
    expect(kinds).toEqual(["asked"]);
  });

  it("never shows the pasted-URL field, even when a provider asks for it anyway", async () => {
    // A device-code sign-in never needs an address pasted back, so if one asks, the question is a
    // sign the sign-in cannot finish. Explain that instead of putting the field on screen.
    const shown: string[] = [];
    const { links, runtimes } = setup({
      signIn: async (interaction) => {
        await interaction.ask({
          kind: "manual_code",
          message: "Paste the full callback URL from the browser",
        });
        shown.push("asked");
      },
    });

    const { status } = await links.startSignIn(null, "openai-codex");
    await vi.waitFor(async () => {
      expect((await links.status(status.token)).signIn?.error).toBe(
        "Motif could not finish the ChatGPT sign-in on its own. Try again, or link an API key instead.",
      );
    });

    expect(shown).toEqual([]);
    expect(runtimes[0]!.stored.size).toBe(0);
  });

  it("answers no AI request while the sign-in is still running", async () => {
    const { links } = setup({ signIn: deviceSignIn() });
    const { token } = (await links.startSignIn(null, "openai-codex")).status;

    expect(await links.complete(token, "hello")).toEqual({
      ok: false,
      reason: "not_linked",
      status: null,
    });
    await links.cancelSignIn(token);
  });

  it("finishes by itself when the provider withdraws its question", async () => {
    // What happens when the approval arrives while a question is still open: the provider closes
    // the question rather than letting the answer arrive late.
    const approved = new AbortController();
    const { links } = setup({
      signIn: async (interaction) => {
        interaction.notify({ kind: "url", url: "https://auth.openai.com/authorize" });
        const asked = interaction.ask({
          kind: "text",
          message: "Which workspace?",
          signal: approved.signal,
        });
        await asked.catch(() => "the provider approved instead");
      },
    });
    const { token } = (await links.startSignIn(null, "openai-codex")).status;
    expect((await links.status(token)).signIn?.prompt?.kind).toBe("text");

    approved.abort();

    await vi.waitFor(async () => {
      expect(await links.status(token)).toMatchObject({
        signIn: null,
        account: { providerId: "openai-codex", method: "sign_in" },
      });
    });
  });

  it("shows only https links, a one-time code, and the latest progress message", async () => {
    const { links } = setup({
      signIn: async (interaction) => {
        interaction.notify({ kind: "url", url: "javascript:alert(document.domain)" });
        interaction.notify({
          kind: "code",
          value: "WDJB-MJHT",
          url: "http://auth.example.com/device",
        });
        interaction.notify({ kind: "message", message: "Waiting for approval" });
        interaction.notify({ kind: "message", message: "Still waiting ".repeat(40) });
        await interaction.ask({ kind: "text", message: "Workspace?" });
      },
    });

    const { signIn } = (await links.startSignIn(null, "openai-codex")).status;

    expect(signIn?.url).toBeUndefined();
    expect(signIn?.code).toBeUndefined();
    expect(signIn?.message).toHaveLength(301);
    expect(signIn?.prompt).toMatchObject({ kind: "text", message: "Workspace?" });
    await links.cancelSignIn((await links.startSignIn(null, "openai-codex")).status.token);
  });

  it("passes on a one-time code and the choices of a question it may show", async () => {
    const chosen: string[] = [];
    const { links } = setup({
      signIn: async (interaction) => {
        // A provider's own choice, not the SDK's sign-in-method one: that is answered for the user.
        chosen.push(
          await interaction.ask({
            kind: "select",
            message: "Which organization?",
            options: [
              { id: "org_1", label: "Acme" },
              { id: "org_2", label: "Personal", description: "Your own workspace" },
            ],
          }),
        );
        interaction.notify({
          kind: "code",
          value: "WDJB-MJHT",
          url: "https://auth.openai.com/codex/device",
        });
        await interaction.ask({ kind: "text", message: "Press enter when done" });
      },
    });
    const first = (await links.startSignIn(null, "openai-codex")).status;
    expect(first.signIn?.prompt?.options).toEqual([
      { id: "org_1", label: "Acme" },
      { id: "org_2", label: "Personal", description: "Your own workspace" },
    ]);

    const next = await links.answerSignIn(first.token, first.signIn!.prompt!.id, "org_2");

    expect(chosen).toEqual(["org_2"]);
    expect(next.status.signIn?.code).toEqual({
      value: "WDJB-MJHT",
      url: "https://auth.openai.com/codex/device",
    });
    expect(next.status.signIn?.prompt?.id).not.toBe(first.signIn!.prompt!.id);
    await links.cancelSignIn(first.token);
  });

  it("reports a failed sign-in until it is dismissed, and keeps no empty link", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { links } = setup({
      signIn: async () => {
        throw new Error("OAuth state mismatch");
      },
    });

    const { status } = await links.startSignIn(null, "openai-codex");

    expect(status.signIn).toEqual({
      providerId: "openai-codex",
      kind: "device_code",
      error: "OAuth state mismatch",
    });
    expect(status.account).toBeNull();
    expect(await links.cancelSignIn(status.token)).toEqual(NOTHING);
    expect(await links.status(status.token)).toEqual(NOTHING);
  });

  it("keeps the linked account when a later sign-in fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { links } = setup({
      signIn: async () => {
        throw new Error("ChatGPT authorization failed: access_denied");
      },
    });
    const { token } = (await links.linkApiKey(null, "opencode", KEY)).status;

    const { status } = await links.startSignIn(token, "openai-codex");

    expect(status.signIn?.error).toBe("ChatGPT authorization failed: access_denied");
    expect(status.account).toMatchObject({ providerId: "opencode", method: "api_key" });
    expect(await links.cancelSignIn(token)).toMatchObject({
      token,
      signIn: null,
      account: { providerId: "opencode" },
    });
  });

  it("cancel stops a running sign-in and frees the way for the next", async () => {
    const signals: AbortSignal[] = [];
    const { links } = setup({
      signIn: async (interaction) => {
        signals.push(interaction.signal);
        await interaction.ask({ kind: "text", message: "Which workspace?" });
      },
    });
    const { token } = (await links.startSignIn(null, "openai-codex")).status;

    expect(await links.cancelSignIn(token)).toEqual(NOTHING);

    expect(signals[0]?.aborted).toBe(true);
    const again = await links.startSignIn(null, "openai-codex");
    expect(again.error).toBeNull();
    expect(again.status.signIn?.prompt).toBeDefined();
    await links.cancelSignIn(again.status.token);
  });

  it("lets two visitors connect at the same time, since a code needs no port", async () => {
    const { links, runtimes } = setup({ signIn: deviceSignIn() });

    const anna = (await links.startSignIn(null, "openai-codex")).status;
    const omar = (await links.startSignIn(null, "openai-codex")).status;

    // Neither is told to wait, and each sees only its own sign-in.
    expect(omar.signIn?.code?.value).toBe("WDJB-MJHT");
    expect(omar.token).not.toBe(anna.token);
    expect(runtimes).toHaveLength(2);
    expect((await links.status(anna.token)).account?.providerId).toBe("openai-codex");
    expect((await links.status(omar.token)).account?.providerId).toBe("openai-codex");
    expect(await links.complete(anna.token, "anna")).toMatchObject({
      text: "openai-codex/gpt-6.1-sol as access-token-1: anna",
    });
  });

  it("still lets only one visitor in at a time through the browser, which holds a port", async () => {
    const { links } = setup({
      signIn: deviceSignIn(),
      browserSignIn: "allow",
    });
    const anna = (await links.startSignIn(null, "openai-codex", "browser")).status;

    const omar = await links.startSignIn(null, "openai-codex", "browser");

    expect(omar.error).toMatch(/Someone else is signing in/);
    expect(omar.status).toEqual(NOTHING);
    await links.cancelSignIn(anna.token);
  });

  it("refuses the browser way in on a hosted app, where its redirect cannot arrive", async () => {
    const { links, runtimes } = setup({ signIn: deviceSignIn() });

    // The default is the hosted app's setting.
    const { error } = await links.startSignIn(null, "openai-codex", "browser");

    expect(error).toBe("Motif signs you in automatically. No address needs to be copied.");
    expect(runtimes).toHaveLength(0);
  });

  it("gives an abandoned browser sign-in's turn to the next visitor", async () => {
    const { links, clock } = setup({ signIn: deviceSignIn(), browserSignIn: "allow" });
    const anna = (await links.startSignIn(null, "openai-codex", "browser")).status;
    clock.now += 60 * 1000;
    await links.status(anna.token);
    clock.now += 60 * 1000;
    expect((await links.startSignIn(null, "openai-codex", "browser")).error).toMatch(
      /Someone else/,
    );

    // Anna's tab is gone: nothing has asked about her sign-in for more than 90 seconds.
    clock.now += 91 * 1000;
    const omar = await links.startSignIn(null, "openai-codex", "browser");

    expect(omar.error).toBeNull();
    expect(omar.status.signIn?.kind).toBe("browser");
    expect(await links.status(anna.token)).toEqual(NOTHING);
    await links.cancelSignIn(omar.status.token);
  });

  it("restarts the link's own sign-in instead of reporting it busy", async () => {
    const { links } = setup({ signIn: deviceSignIn(), browserSignIn: "allow" });
    const first = (await links.startSignIn(null, "openai-codex", "browser")).status;

    const second = await links.startSignIn(first.token, "openai-codex", "browser");

    expect(second.error).toBeNull();
    expect(second.status.token).toBe(first.token);
    expect(second.status.signIn?.prompt?.id).not.toBe(first.signIn?.prompt?.id);
    await links.cancelSignIn(first.token);
  });

  it("cancels a sign-in that takes too long", async () => {
    const { links } = setup({ signIn: openSignIn(), signInTimeoutMs: 60 });
    const { token } = (await links.startSignIn(null, "openai-codex")).status;

    await vi.waitFor(async () => {
      expect((await links.status(token)).signIn).toEqual({
        providerId: "openai-codex",
        kind: "device_code",
        url: "https://auth.openai.com/authorize?state=abc",
        error: "The sign-in took too long. Start it again.",
      });
    });
    expect((await links.startSignIn(null, "openai-codex")).error).toBeNull();
  });

  it("linking a key instead cancels the link's running sign-in", async () => {
    const { links } = setup({ signIn: deviceSignIn() });
    const { token } = (await links.startSignIn(null, "openai-codex")).status;

    const { status } = await links.linkApiKey(token, "opencode", KEY);

    expect(status).toMatchObject({ token, signIn: null, account: { providerId: "opencode" } });
    expect((await links.startSignIn(null, "openai-codex")).error).toBeNull();
  });

  it("refuses a sign-in for a provider that only takes a key", async () => {
    const { links, runtimes } = setup();

    const { status, error } = await links.startSignIn(null, "opencode");

    expect(error).toBe("OpenCode Zen has no sign-in. Link it with an API key.");
    expect(status).toEqual(NOTHING);
    expect(runtimes).toHaveLength(0);
  });
});
