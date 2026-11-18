import { randomUUID } from "node:crypto";
import type { AiFailure, KeyProblem, ProviderId } from "./provider-registry";

// ABSH-90: opt-in Sentry events, not automatic exception/request capture. Deliberately accept
// only registry IDs and classified reasons; never pass request URLs, owner IDs or provider data.
export async function reportProviderFailure(
  provider: ProviderId,
  operation: "validation" | "exchange" | "inference",
  reason: AiFailure | KeyProblem,
): Promise<void> {
  const configured = process.env["MOTIF_SENTRY_DSN"];
  if (!configured) return;
  try {
    const dsn = new URL(configured);
    const project = dsn.pathname.split("/").pop();
    if (dsn.protocol !== "https:" || !dsn.username || !project || !/^\d+$/.test(project)) return;
    const endpoint = new URL(dsn.pathname.replace(/\d+$/, `api/${project}/envelope/`), dsn.origin);
    endpoint.searchParams.set("sentry_key", dsn.username);
    const event_id = randomUUID().replaceAll("-", "");
    const event = {
      event_id,
      level: "warning",
      platform: "node",
      message: "Provider request failed",
      tags: { provider, operation, reason },
    };
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(2000),
      body: [{ event_id }, { type: "event" }, event].map((part) => JSON.stringify(part)).join("\n"),
    });
    await response.body?.cancel();
  } catch {
    // Reporting must never block connection recovery or log the DSN.
  }
}
