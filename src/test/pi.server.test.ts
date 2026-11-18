// @vitest-environment node
// The Pi SDK itself runs in these tests; only the network is replaced. They pin down what Motif
// relies on, so an SDK upgrade that changes it fails here first.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPiRuntime } from "@/lib/pi.server";

import { principal, createTempVault } from "./test-vault";

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
function stubNetwork(respond: (sent: Sent) => Response | Promise<Response>): Sent[] {
  const sent: Sent[] = [];
  const mock = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
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

let vault: ReturnType<typeof createTempVault>;

beforeEach(() => {
  vault = createTempVault();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vault.cleanup();
});

describe("API keys through the Pi SDK", () => {
  it("stores a key and sends the prompt with it", async () => {
    const sent = stubNetwork(() => chatCompletionsStream("kimi-k2.7-code", REPLY));
    const runtime = await createPiRuntime(principal("a"));

    await runtime.linkApiKey("opencode", KEY);
    const result = await runtime.complete("opencode", "kimi-k2.7-code", "Extract a style");

    expect(result).toEqual({ ok: true, text: REPLY });
    expect(await runtime.linked()).toEqual([{ providerId: "opencode", method: "api_key" }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://opencode.ai/inference/openai/v1/chat/completions");
    expect(sent[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(sent[0]!.body)).toMatchObject({ model: "kimi-k2.7-code" });
  });

  it("reaches OpenAI through the Responses API", async () => {
    const sent = stubNetwork(() => responsesStream("gpt-6.1-sol", REPLY));
    const runtime = await createPiRuntime(principal("b"));

    await runtime.linkApiKey("openai", "sk-proj-Zx81TESTKEYq7Lm");
    const result = await runtime.complete("openai", "gpt-6.1-sol", "Extract a style");

    expect(result).toEqual({ ok: true, text: REPLY });
    expect(sent.map(({ url, authorization }) => [url, authorization])).toEqual([
      ["https://api.openai.com/v1/responses", "Bearer sk-proj-Zx81TESTKEYq7Lm"],
    ]);
  });

  it("sends a key exactly as typed: no shell command runs and no environment is read", async () => {
    // The SDK's file store would run the first as a command and expand the second.
    const marker = join(tmpdir(), `motif-pi-test-${process.pid}-${Date.now()}`);
    vi.stubEnv("MOTIF_TEST_SECRET", "the-servers-own-secret");
    const sent = stubNetwork(() => chatCompletionsStream("kimi-k2.7-code", REPLY));

    for (const [index, typed] of [`!touch ${marker}`, "$MOTIF_TEST_SECRET"].entries()) {
      const runtime = await createPiRuntime(principal(String(index + 10)));
      await runtime.linkApiKey("opencode", typed);
      await runtime.complete("opencode", "kimi-k2.7-code", "hello");
    }

    expect(sent.map(({ authorization }) => authorization)).toEqual([
      `Bearer !touch ${marker}`,
      "Bearer $MOTIF_TEST_SECRET",
    ]);
    expect(existsSync(marker)).toBe(false);
  });

  it("does not fall back to the server's own environment without a linked key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-THE-OWNERS-KEY");
    const sent = stubNetwork(() => responsesStream("gpt-6.1-sol", REPLY));
    const runtime = await createPiRuntime(principal("c"));

    await expect(runtime.complete("openai", "gpt-6.1-sol", "hello")).resolves.toEqual({
      ok: false,
      reason: "not_linked",
      status: null,
    });
    expect(sent).toHaveLength(0);
  });

  it("reports a provider rejection without returning the provider's body", async () => {
    const secret = "sk-proj-THE-OWNERS-SECRET";
    stubNetwork(() => providerError(401, secret));
    const runtime = await createPiRuntime(principal("d"));
    await runtime.linkApiKey("openai", secret);

    const result = await runtime.complete("openai", "gpt-6.1-sol", "hello");

    expect(result).toEqual({ ok: false, reason: "rejected", status: 401 });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("keeps connections of one principal from appearing under another", async () => {
    const runtimeA = await createPiRuntime(principal("e"));
    await runtimeA.linkApiKey("opencode", KEY);

    const runtimeB = await createPiRuntime(principal("f"));

    expect(await runtimeB.linked()).toEqual([]);
    expect(await runtimeA.linked()).toEqual([{ providerId: "opencode", method: "api_key" }]);
  });
});
