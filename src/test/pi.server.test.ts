// @vitest-environment node
// The Pi SDK itself runs in these tests; only the network is replaced. They pin down what Motif
// relies on, so an SDK upgrade that changes it fails here first.
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LINK_PROVIDERS } from "@/lib/account-link";
import type { SignInEvent, SignInQuestion } from "@/lib/account-link.server";
import { createPiRuntime } from "@/lib/pi.server";

const KEY = "sk-zen-Qm81TESTKEYq7Lm0000";
const REPLY = '{"name":"Night Drive"}';

type Sent = { url: string; authorization: string | null; body: string };

function eventStream(events: { event?: string; data: unknown }[]): Response {
  const text = events
    .map(({ event, data }) => {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      return `${event ? `event: ${event}\n` : ""}data: ${payload}\n\n`;
    })
    .join("");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** A Chat Completions stream as OpenCode sends it: reasoning, the reply in two parts, usage. */
function chatCompletionsStream(model: string, text: string): Response {
  const chunk = (delta: object, finish: string | null = null) => ({
    id: "chatcmpl-9fA2",
    object: "chat.completion.chunk",
    created: 1794650000,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  const usage = { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 };
  return eventStream([
    { data: chunk({ role: "assistant", reasoning_content: "The user wants a short name." }) },
    { data: chunk({ content: text.slice(0, 8) }) },
    { data: chunk({ content: text.slice(8) }) },
    { data: chunk({}, "stop") },
    { data: { ...chunk({}), choices: [], usage } },
    { data: "[DONE]" },
  ]);
}

/** A Responses API stream as OpenAI sends it: a reasoning item, then the message. */
function responsesStream(model: string, text: string): Response {
  const summary = { type: "summary_text", text: "Naming the style." };
  const reasoning = { id: "rs_0a1b", type: "reasoning", summary: [summary] };
  const thought = { item_id: "rs_0a1b", output_index: 0, summary_index: 0 };
  const part = { type: "output_text", text, annotations: [] };
  const item = { id: "msg_0a1b", type: "message", role: "assistant" };
  const done = { ...item, status: "completed", content: [part] };
  const at = { item_id: "msg_0a1b", output_index: 1, content_index: 0 };
  const response = (status: string, output: unknown[]) => ({
    id: "resp_0a1b",
    object: "response",
    created_at: 1794650000,
    status,
    model,
    output,
    usage:
      status === "completed"
        ? {
            input_tokens: 12,
            output_tokens: 7,
            total_tokens: 19,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 3 },
          }
        : null,
  });
  const events = [
    { type: "response.created", response: response("in_progress", []) },
    { type: "response.output_item.added", output_index: 0, item: { ...reasoning, summary: [] } },
    { type: "response.reasoning_summary_part.added", ...thought, part: { ...summary, text: "" } },
    { type: "response.reasoning_summary_text.delta", ...thought, delta: summary.text },
    { type: "response.reasoning_summary_text.done", ...thought, text: summary.text },
    { type: "response.reasoning_summary_part.done", ...thought, part: summary },
    { type: "response.output_item.done", output_index: 0, item: reasoning },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: { ...item, status: "in_progress", content: [] },
    },
    { type: "response.content_part.added", ...at, part: { ...part, text: "" } },
    { type: "response.output_text.delta", ...at, delta: text.slice(0, 8) },
    { type: "response.output_text.delta", ...at, delta: text.slice(8) },
    { type: "response.output_text.done", ...at, text },
    { type: "response.content_part.done", ...at, part },
    { type: "response.output_item.done", output_index: 1, item: done },
    { type: "response.completed", response: response("completed", [reasoning, done]) },
  ];
  return eventStream(
    events.map((data, index) => ({ event: data.type, data: { ...data, sequence_number: index } })),
  );
}

function providerError(status: number, key: string): Response {
  const body = {
    error: {
      message: `Incorrect API key provided: ${key.slice(0, 8)}********${key.slice(-4)}.`,
      type: "invalid_request_error",
      code: "invalid_api_key",
    },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Replaces the network. Records what the SDK sends and answers with `respond`. */
function stubNetwork(respond: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const realFetch = globalThis.fetch;
  const mock = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // The sign-in's own listener on this machine is real.
    if (url.startsWith("http://127.0.0.1:1455/")) return realFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
    const raw = init?.body;
    const body =
      typeof raw === "string" ? raw : raw instanceof URLSearchParams ? raw.toString() : "";
    const request = { url, authorization: headers.get("authorization"), body };
    sent.push(request);
    return respond(request);
  });
  vi.stubGlobal("fetch", mock);
  return sent;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API keys through the Pi SDK", () => {
  it("stores a key and sends the prompt to the provider's model with it", async () => {
    const sent = stubNetwork(() => chatCompletionsStream("kimi-k2.7-code", REPLY));
    const runtime = await createPiRuntime();

    await runtime.linkApiKey("opencode", KEY);
    const result = await runtime.complete("opencode", "kimi-k2.7-code", "Extract a style");

    expect(result).toEqual({ ok: true, text: REPLY });
    expect(await runtime.linked()).toEqual([{ providerId: "opencode", method: "api_key" }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://opencode.ai/inference/openai/v1/chat/completions");
    expect(sent[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(sent[0]!.body)).toMatchObject({
      model: "kimi-k2.7-code",
      messages: [{ role: "user", content: "Extract a style" }],
    });
  });

  it("reaches OpenAI through the Responses API", async () => {
    const sent = stubNetwork(() => responsesStream("gpt-6.1-sol", REPLY));
    const runtime = await createPiRuntime();

    await runtime.linkApiKey("openai", "sk-proj-Zx81TESTKEYq7Lm");
    const result = await runtime.complete("openai", "gpt-6.1-sol", "Extract a style");

    expect(result).toEqual({ ok: true, text: REPLY });
    expect(sent.map(({ url, authorization }) => [url, authorization])).toEqual([
      ["https://api.openai.com/v1/responses", "Bearer sk-proj-Zx81TESTKEYq7Lm"],
    ]);
    expect(JSON.parse(sent[0]!.body)).toMatchObject({
      model: "gpt-6.1-sol",
      input: [{ role: "user", content: [{ type: "input_text", text: "Extract a style" }] }],
    });
  });

  it("sends a key exactly as typed: no shell command runs and no environment is read", async () => {
    // The SDK's file store would run the first as a command and expand the second.
    const marker = join(tmpdir(), `motif-pi-test-${process.pid}-${Date.now()}`);
    vi.stubEnv("MOTIF_TEST_SECRET", "the-servers-own-secret");
    const sent = stubNetwork(() => chatCompletionsStream("kimi-k2.7-code", REPLY));

    for (const typed of [`!touch ${marker}`, "$MOTIF_TEST_SECRET"]) {
      const runtime = await createPiRuntime();
      await runtime.linkApiKey("opencode", typed);
      await runtime.complete("opencode", "kimi-k2.7-code", "hello");
    }

    expect(sent.map(({ authorization }) => authorization)).toEqual([
      `Bearer !touch ${marker}`,
      "Bearer $MOTIF_TEST_SECRET",
    ]);
    expect(existsSync(marker)).toBe(false);
  });

  it("sends nothing without a linked account, even when the server has a key of its own", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-THE-OWNERS-KEY");
    vi.stubEnv("OPENCODE_API_KEY", "sk-zen-THE-OWNERS-KEY");
    const sent = stubNetwork(() => responsesStream("gpt-6.1-sol", REPLY));
    const runtime = await createPiRuntime();

    const openai = await runtime.complete("openai", "gpt-6.1-sol", "hello");
    await runtime.linkApiKey("opencode-go", KEY);
    const opencode = await runtime.complete("opencode", "kimi-k2.7-code", "hello");

    expect(openai).toEqual({ ok: false, reason: "not_linked", status: null });
    expect(opencode).toEqual({ ok: false, reason: "not_linked", status: null });
    expect(await runtime.linked()).toEqual([{ providerId: "opencode-go", method: "api_key" }]);
    expect(sent).toEqual([]);
  });

  it("keeps two visitors' credentials apart", async () => {
    const sent = stubNetwork(() => chatCompletionsStream("kimi-k2.7-code", REPLY));
    const anna = await createPiRuntime();
    const omar = await createPiRuntime();

    await anna.linkApiKey("opencode", "sk-zen-ANNA-0000000000");
    await omar.linkApiKey("opencode", "sk-zen-OMAR-0000000000");
    await omar.complete("opencode", "kimi-k2.7-code", "hello");
    await anna.complete("opencode", "kimi-k2.7-code", "hello");
    await anna.unlink("opencode");

    expect(sent.map(({ authorization }) => authorization)).toEqual([
      "Bearer sk-zen-OMAR-0000000000",
      "Bearer sk-zen-ANNA-0000000000",
    ]);
    expect(await anna.linked()).toEqual([]);
    expect(await omar.linked()).toEqual([{ providerId: "opencode", method: "api_key" }]);
  });

  it.each([
    [401, "rejected"],
    [403, "rejected"],
    [402, "limited"],
    [429, "limited"],
    [500, "failed"],
  ] as const)("reports HTTP %i as %s, without the provider's message", async (status, reason) => {
    stubNetwork(() => providerError(status, KEY));
    const runtime = await createPiRuntime();
    await runtime.linkApiKey("opencode", KEY);

    const result = await runtime.complete("opencode", "kimi-k2.7-code", "hello");

    expect(result).toEqual({ ok: false, reason, status });
  });

  it("reports an unreachable provider as a plain failure", async () => {
    stubNetwork(() => {
      throw new TypeError("fetch failed");
    });
    const runtime = await createPiRuntime();
    await runtime.linkApiKey("opencode", KEY);

    const result = await runtime.complete("opencode", "kimi-k2.7-code", "hello");

    expect(result).toEqual({ ok: false, reason: "failed", status: null });
  });

  it("offers Motif's default model for every provider in the pop-up", async () => {
    const runtime = await createPiRuntime();

    for (const provider of LINK_PROVIDERS) {
      await runtime.linkApiKey(provider.id, KEY);
      const ids = (await runtime.models(provider.id)).map((model) => model.id);
      expect(ids, provider.id).toContain(provider.defaultModel);
    }
    expect(await runtime.models("opencode")).toContainEqual({
      id: "kimi-k2.7-code",
      name: expect.any(String),
    });
  });

  it("gets a request out through every API the offered providers use", async () => {
    // One model per API. The SDK's Google adapter takes no caller fetch, so the status of its
    // failures goes unseen. A new API in the catalog must be checked for the same limit.
    const catalog = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
    });
    const modelOf = new Map<string, { providerId: string; modelId: string }>();
    for (const { id: providerId } of LINK_PROVIDERS) {
      for (const model of catalog.getModels(providerId)) {
        if (!modelOf.has(model.api)) modelOf.set(model.api, { providerId, modelId: model.id });
      }
    }
    const sent = stubNetwork(() => providerError(401, KEY));
    const runtime = await createPiRuntime();
    for (const { id } of LINK_PROVIDERS) await runtime.linkApiKey(id, KEY);

    const outcome: Record<string, unknown> = {};
    for (const [api, { providerId, modelId }] of modelOf) {
      outcome[api] = await runtime.complete(providerId, modelId, "hello");
    }

    expect(outcome).toEqual({
      "openai-responses": { ok: false, reason: "rejected", status: 401 },
      "openai-completions": { ok: false, reason: "rejected", status: 401 },
      "anthropic-messages": { ok: false, reason: "rejected", status: 401 },
      "google-generative-ai": { ok: false, reason: "failed", status: null },
    });
    expect(sent).toHaveLength(4);
  });
});

describe("Sign in with ChatGPT through the Pi SDK", () => {
  const TOKEN_URL = "https://auth.openai.com/api/accounts/oauth/token";
  const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

  /** What OpenAI's token endpoint answers. A token good for 100 s is already due for renewal. */
  function tokens(n: number, expiresIn = 3600): Response {
    const body = {
      access_token: `access-${n}`,
      refresh_token: `refresh-${n}`,
      id_token: "eyJhbGciOiJSUzI1NiJ9.e30.c2ln",
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: SCOPE,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  /** Starts the sign-in and waits until it shows its page and asks for the redirect address. */
  async function startSignIn(runtime: Awaited<ReturnType<typeof createPiRuntime>>) {
    const events: SignInEvent[] = [];
    const questions: SignInQuestion[] = [];
    let answer: (value: string) => void = () => {};
    const controller = new AbortController();
    const finished = runtime.signIn("openai", {
      signal: controller.signal,
      ask: (question) => {
        questions.push(question);
        return new Promise<string>((resolve, reject) => {
          answer = resolve;
          controller.signal.addEventListener("abort", () => reject(new Error("cancelled")));
        });
      },
      notify: (event) => events.push(event),
    });
    finished.catch(() => {});
    await vi.waitFor(() => expect(questions).toHaveLength(1));
    const page = events.find((event) => event.kind === "url");
    return {
      events,
      questions,
      finished,
      controller,
      answer: (value: string) => answer(value),
      url: new URL(page?.kind === "url" ? page.url : "about:blank"),
    };
  }

  it("shows OpenAI's page, takes the pasted redirect, and runs requests on the subscription", async () => {
    let issued = 0;
    const sent = stubNetwork(({ url }) => {
      if (url !== TOKEN_URL) return responsesStream("gpt-6.1-sol", REPLY);
      issued += 1;
      return tokens(issued, issued === 1 ? 100 : 3600);
    });
    const runtime = await createPiRuntime();

    const signIn = await startSignIn(runtime);

    const query = signIn.url.searchParams;
    expect(signIn.url.origin + signIn.url.pathname).toBe(
      "https://auth.openai.com/api/accounts/authorize",
    );
    expect(query.get("agent_name_hint")).toBe("Motif");
    expect(query.get("ext_agent_host_id")).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(query.get("redirect_uri")).toBe("http://127.0.0.1:1455/auth/callback");
    expect(signIn.questions[0]).toMatchObject({
      kind: "manual_code",
      placeholder: "http://127.0.0.1:1455/auth/callback",
    });
    expect(await runtime.linked()).toEqual([]);

    const state = encodeURIComponent(query.get("state") ?? "");
    signIn.answer(
      `http://127.0.0.1:1455/auth/callback?code=ac_9f2&state=${state}&client_id=app_71`,
    );
    await signIn.finished;

    expect(await runtime.linked()).toEqual([{ providerId: "openai", method: "sign_in" }]);
    expect(sent[0]?.url).toBe(TOKEN_URL);
    expect(Object.fromEntries(new URLSearchParams(sent[0]?.body))).toMatchObject({
      grant_type: "authorization_code",
      code: "ac_9f2",
      client_id: "app_71",
    });
    expect((await runtime.models("openai")).map((model) => model.id)).toContain("gpt-6.1-sol");

    // The first token is already due for renewal: the SDK renews it, then sends the request.
    const result = await runtime.complete("openai", "gpt-6.1-sol", "Extract a style");

    expect(result).toEqual({ ok: true, text: REPLY });
    expect(sent.slice(1).map(({ url, authorization }) => [url, authorization])).toEqual([
      [TOKEN_URL, null],
      ["https://api.openai.com/v1/responses", "Bearer access-2"],
    ]);
    expect(new URLSearchParams(sent[1]?.body).get("refresh_token")).toBe("refresh-1");
  });

  it("finishes by itself when the browser's redirect reaches this machine", async () => {
    stubNetwork(() => tokens(1));
    const runtime = await createPiRuntime();
    const signIn = await startSignIn(runtime);

    const state = encodeURIComponent(signIn.url.searchParams.get("state") ?? "");
    const page = await fetch(
      `http://127.0.0.1:1455/auth/callback?code=ac_9f2&state=${state}&client_id=app_71`,
    );
    await signIn.finished;

    expect(page.status).toBe(200);
    expect(await runtime.linked()).toEqual([{ providerId: "openai", method: "sign_in" }]);
    expect(signIn.events.at(-1)).toEqual({
      kind: "message",
      message: "Exchanging authorization code for tokens...",
    });
  });

  it("reports a sign-in that OpenAI has revoked as rejected", async () => {
    let revoked = false;
    const sent = stubNetwork(({ url }) => {
      if (url !== TOKEN_URL) return responsesStream("gpt-6.1-sol", REPLY);
      if (!revoked) return tokens(1, 100);
      const body = { error: "invalid_grant", error_description: "Token has been revoked." };
      return new Response(JSON.stringify(body), { status: 400 });
    });
    const runtime = await createPiRuntime();
    const signIn = await startSignIn(runtime);
    const state = encodeURIComponent(signIn.url.searchParams.get("state") ?? "");
    signIn.answer(
      `http://127.0.0.1:1455/auth/callback?code=ac_9f2&state=${state}&client_id=app_71`,
    );
    await signIn.finished;
    revoked = true;

    const result = await runtime.complete("openai", "gpt-6.1-sol", "hello");

    expect(result).toEqual({ ok: false, reason: "rejected", status: null });
    expect(sent.map(({ url }) => url)).toEqual([TOKEN_URL, TOKEN_URL]);
  });

  it("fails on a wrong redirect address, and cancelling frees the port for the next sign-in", async () => {
    stubNetwork(() => tokens(1));
    const runtime = await createPiRuntime();

    const wrong = await startSignIn(runtime);
    wrong.answer("https://example.com/not-the-callback");
    await expect(wrong.finished).rejects.toThrow(
      "The pasted callback URL must start with http://127.0.0.1:1455/auth/callback",
    );

    const cancelled = await startSignIn(runtime);
    cancelled.controller.abort();
    await expect(cancelled.finished).rejects.toThrow();

    const next = await startSignIn(runtime);
    expect(next.url.searchParams.get("state")).not.toBe(cancelled.url.searchParams.get("state"));
    next.controller.abort();
    await expect(next.finished).rejects.toThrow();
    expect(await runtime.linked()).toEqual([]);
  });
});
