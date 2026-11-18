// Loaded ONLY into the isolated test server. No provider credentials, DNS or external traffic.
import { createHash } from "node:crypto";

const models = ["openrouter/auto", "google/gemma-4-31b-it:free"];
const key = "fixture-openrouter-minted";
const replacement = "fixture-openrouter-replacement";
const fetchLocal = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin === process.env.MOTIF_PUBLIC_BASE_URL) return fetchLocal(request);
  if (url.origin !== "https://openrouter.ai") throw new Error("External fetch blocked in E2E");
  if (url.pathname === "/api/v1/auth/keys") {
    const { code, code_verifier, code_challenge_method } = await request.json();
    const challenge = createHash("sha256").update(code_verifier).digest("base64url");
    return code_challenge_method === "S256" && challenge === code
      ? Response.json({ key })
      : new Response(null, { status: 400 });
  }
  const auth = request.headers.get("authorization");
  if (![key, replacement].some((k) => auth === `Bearer ${k}`))
    return new Response(null, { status: 401 });
  if (url.pathname === "/api/v1/models/user")
    return Response.json({ data: models.map((id) => ({ id })) });
  if (url.pathname === "/api/v1/key") return Response.json({ data: {} });
  if (url.pathname !== "/api/v1/chat/completions") return new Response(null, { status: 404 });
  const { model, messages } = await request.json();
  if (messages.at(-1)?.content.includes("quota-probe"))
    return Response.json({ error: { message: "Out of credit" } }, { status: 402 });
  const reply = JSON.stringify({
    reply: `Fixture reply from ${model}`,
    steps: [],
    filename: "test.mp4",
    duration: "00:01",
    cuts: 1,
    captions: [],
  });
  const chunk = {
    id: "fixture",
    model,
    object: "chat.completion.chunk",
    created: 1,
    choices: [{ index: 0, delta: { role: "assistant", content: reply }, finish_reason: "stop" }],
  };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
};
