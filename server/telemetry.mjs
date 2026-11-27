import fs from "node:fs";
import { randomUUID } from "node:crypto";

// PostHog project tokens are public client-side keys by design; env vars override.
export const DEFAULT_POSTHOG_PUBLIC_KEY = "phc_zkpPuDN4BW22QtrcZ9Tp6sZhcpgDkxKv3NemR3RXj2qZ";
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
// Optional build-time config (untracked, git-ignored): { "sentryDsn": "..." } placed next to this file when packaging.
let buildConfig = {};
try { buildConfig = JSON.parse(fs.readFileSync(new URL("./build-config.json", import.meta.url), "utf8")); } catch { /* not present */ }
export const sentryDsn = () => process.env.SENTRY_DSN || buildConfig.sentryDsn || "";
const MAX_DIAGNOSTICS = 80;
const anonymousSessionId = randomUUID();
const diagnostics = [];
let sentry = null;
let posthog = null;

export function recordDiagnostic(entry) {
  diagnostics.push({ at: new Date().toISOString(), ...entry });
  if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift();
}

export function getDiagnostics() {
  return diagnostics.slice().reverse();
}

export async function initializeTelemetry(enabled = false) {
  if (!enabled) {
    try { await posthog?.shutdown?.(); } catch { /* best effort */ }
    try { await sentry?.close?.(2000); } catch { /* best effort */ }
    posthog = null;
    sentry = null;
    return telemetryConfig();
  }
  if (sentryDsn() && !sentry) {
    try {
      const sdk = await import("@sentry/node");
      sdk.init({ dsn: sentryDsn(), environment: process.env.NODE_ENV || "production", sendDefaultPii: false });
      sentry = sdk;
    } catch (error) { recordDiagnostic({ kind: "telemetry_init", provider: "sentry", message: String(error?.message || error) }); }
  }
  const key = process.env.POSTHOG_API_KEY || process.env.POSTHOG_PUBLIC_KEY;
  if (key && !posthog) {
    try {
      const { PostHog } = await import("posthog-node");
      posthog = new PostHog(key, { host: process.env.POSTHOG_HOST || "https://us.i.posthog.com" });
    } catch (error) { recordDiagnostic({ kind: "telemetry_init", provider: "posthog", message: String(error?.message || error) }); }
  }
  return telemetryConfig();
}

export function telemetryConfig() {
  return { sentryConfigured: Boolean(sentryDsn()), posthogConfigured: Boolean(process.env.POSTHOG_API_KEY || process.env.POSTHOG_PUBLIC_KEY), diagnosticsAvailable: true };
}

export function captureTelemetryEvent(name, properties = {}, enabled = false) {
  if (!enabled) return;
  const safeProperties = Object.fromEntries(Object.entries(properties).filter(([key, value]) => !/email|token|secret|password|path|transcript|content/i.test(key) && ["string", "number", "boolean"].includes(typeof value)));
  posthog?.capture({ distinctId: anonymousSessionId, event: String(name).slice(0, 80), properties: safeProperties });
}

export function captureTelemetryError(error, enabled = false) {
  const message = String(error?.message || error || "Unknown error").slice(0, 500);
  recordDiagnostic({ kind: "error", message });
  if (enabled) {
    sentry?.captureException(error instanceof Error ? error : new Error(message));
    posthog?.capture({ distinctId: anonymousSessionId, event: "motif_server_error", properties: { kind: "server_error" } });
  }
}

export async function flushTelemetry() {
  await posthog?.shutdown?.();
  await sentry?.close?.(2000);
}
