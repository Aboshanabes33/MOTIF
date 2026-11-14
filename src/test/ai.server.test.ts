import { afterEach, describe, expect, it, vi } from "vitest";

import { ask } from "@/lib/ai.server";

const KEY = "sk-proj-Zx81TESTKEYq7Lm";

function respondWith(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(text, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ask", () => {
  it("sends the prompt to the OpenAI Responses API and returns the reply text", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    // Shape of a real Responses API reply: a reasoning item, then the message split in two parts.
    const fetchMock = respondWith(200, {
      id: "resp_0a1b",
      object: "response",
      status: "completed",
      output: [
        {
          id: "rs_0a1b",
          type: "reasoning",
          summary: [{ type: "summary_text", text: "Naming the style." }],
          content: [{ type: "reasoning_text", text: "The user wants a short name." }],
        },
        {
          id: "msg_0a1b",
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: '{"name":"Night', annotations: [] },
            { type: "output_text", text: ' Drive"}', annotations: [] },
          ],
        },
      ],
    });

    await expect(ask("Extract a style")).resolves.toBe('{"name":"Night Drive"}');

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-6-astra", input: "Extract a style" }),
    });
  });

  it("fails without a key and sends nothing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = respondWith(200, {});

    await expect(ask("hello")).rejects.toThrow("OPENAI_API_KEY is not set");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports OpenAI's error code but not its message, which repeats part of the key", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    respondWith(401, {
      error: {
        message:
          "Incorrect API key provided: sk-proj-********q7Lm. You can find your API key at https://platform.openai.com/account/api-keys.",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    });

    const error: unknown = await ask("hello").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    const { message } = error as Error;
    expect(message).toBe("OpenAI request failed: HTTP 401 (invalid_api_key)");
    expect(message).not.toContain("sk-proj");
    expect(message).not.toContain("q7Lm");
  });

  it("still reports the status when the error body is not JSON", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY);
    respondWith(502, "<html><body>502 Bad Gateway</body></html>");

    await expect(ask("hello")).rejects.toThrow("OpenAI request failed: HTTP 502 (no error code)");
  });
});
