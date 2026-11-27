import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import posthog, { isPostHogConfigured } from "./posthog";

let enabled = false;
let active = false;
let posthogStarted = false;
let browserConfig: any = null;
let serverOnlyAnalytics = false;

export async function initializeClientTelemetry(telemetryEnabled: boolean) {
  enabled = telemetryEnabled;
  if (!telemetryEnabled) {
    if (active) {
      posthog.opt_out_capturing();
      await Sentry.close(1000).catch(() => {});
      active = false;
    }
    return;
  }
  if (active) return;
  try {
    browserConfig ||= await fetch("/api/telemetry/config", { cache: "no-store" }).then((response) => response.json());
    if (browserConfig.sentryDsn) Sentry.init({ dsn: browserConfig.sentryDsn, tracesSampleRate: 0.05 });
    serverOnlyAnalytics = Boolean(browserConfig.posthogConfigured && !browserConfig.posthogPublicKey);
    if (browserConfig.posthogPublicKey) {
      if (isPostHogConfigured || posthogStarted) {
        posthog.opt_in_capturing();
      } else {
        posthog.init(browserConfig.posthogPublicKey, {
          ...(browserConfig.posthogHost ? { api_host: browserConfig.posthogHost } : {}),
          persistence: "localStorage",
        });
        posthogStarted = true;
      }
    }
    active = true;
  } catch { /* telemetry never affects app startup */ }
}

export function captureAppEvent(event: string, properties: Record<string, string | number | boolean> = {}) {
  if (!enabled) return;
  if (serverOnlyAnalytics) {
    fetch("/api/telemetry/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, properties }) }).catch(() => {});
  } else posthog.capture(event, properties);
}

export function reportAppError(error: unknown) {
  if (!enabled) return;
  Sentry.captureException(error);
}

export function TelemetryErrorBoundary({ children }: { children: ReactNode }) {
  return <Sentry.ErrorBoundary fallback={({ resetError }) => <main className="error-boundary"><h1>MOTIF</h1><p>Something went wrong while showing this view.</p><button onClick={resetError}>Try again</button></main>}>{children}</Sentry.ErrorBoundary>;
}
