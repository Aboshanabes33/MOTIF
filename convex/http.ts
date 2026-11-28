import { httpActionGeneric, httpRouter, makeFunctionReference } from "convex/server";

const applyWhopRef = makeFunctionReference<
  "mutation",
  { email: string; plan: "free" | "monthly" | "yearly"; active: boolean },
  boolean
>("users:applyWhop");

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacB64(keyBytes: Uint8Array, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let s = "";
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s);
}

// Standard Webhooks verification (Whop uses this spec). Tries the secret as whsec_<base64> and as raw text.
async function verify(secret: string, id: string, ts: string, body: string, header: string): Promise<boolean> {
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const candidates: Uint8Array[] = [new TextEncoder().encode(secret)];
  try { candidates.unshift(b64ToBytes(secret.replace(/^whsec_/, ""))); } catch { /* not base64 */ }
  const given = header.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
  for (const key of candidates) {
    const expected = await hmacB64(key, `${id}.${ts}.${body}`);
    if (given.includes(expected)) return true;
  }
  return false;
}

const http = httpRouter();

http.route({
  path: "/whop",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    const secret = process.env.WHOP_WEBHOOK_SECRET;
    if (!secret) return new Response("not configured", { status: 503 });
    const body = await request.text();
    const ok = await verify(
      secret,
      request.headers.get("webhook-id") || "",
      request.headers.get("webhook-timestamp") || "",
      body,
      request.headers.get("webhook-signature") || "",
    );
    if (!ok) return new Response("bad signature", { status: 401 });

    const event = JSON.parse(body);
    const data = event?.data ?? {};
    const email: string | undefined = data.user?.email ?? data.member?.user?.email ?? data.email;
    const whopPlan: string | undefined = data.plan?.id ?? data.plan_id;
    const plan = whopPlan && whopPlan === process.env.WHOP_PLAN_ID_YEARLY ? "yearly" : whopPlan && whopPlan === process.env.WHOP_PLAN_ID_MONTHLY ? "monthly" : null;
    if (!email || !plan) return new Response("ignored", { status: 200 });

    const type = String(event?.type || "");
    if (type === "membership.activated" || type === "payment.succeeded") {
      await ctx.runMutation(applyWhopRef, { email, plan, active: true });
    } else if (type === "membership.deactivated") {
      await ctx.runMutation(applyWhopRef, { email, plan, active: false });
    }
    return new Response("ok", { status: 200 });
  }),
});

export default http;
