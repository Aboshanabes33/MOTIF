// The one place that talks to an AI provider. Server only: it reads the provider key, and the
// build refuses to let browser code import a *.server.* file (see vite.config.ts).

/** Sends one prompt to the model and returns the text of its reply. */
export async function ask(prompt: string): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in the server environment.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-6-astra", input: prompt }),
  });
  if (!response.ok) {
    // Report OpenAI's error code, never its message: the message can repeat part of the key.
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: unknown; type?: unknown };
    } | null;
    const code = String(body?.error?.code ?? body?.error?.type ?? "no error code");
    throw new Error(`OpenAI request failed: HTTP ${response.status} (${code})`);
  }
  const res = (await response.json()) as { output?: unknown[] };
  let out = "";
  for (const item of res.output ?? []) {
    const it = item as { type?: string; content?: { type: string; text?: string }[] };
    if (it.type === "message") {
      for (const c of it.content ?? []) if (c.type === "output_text") out += c.text ?? "";
    }
  }
  return out;
}
