import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import posthog, { isPostHogConfigured } from "./posthog";

let enabled = false;
let active = false;
let posthogStarted = false;
let browserConfig: any = null;
let serverOnlyAnalytics = false;

// Link Sentry errors to the same anonymous PostHog person/session (random ids, no PII).
function linkSentry(ph: { get_distinct_id: () => string; get_session_id: () => string; onSessionId: (cb: (id: string) => void) => unknown }) {
  try {
    if (!browserConfig?.sentryDsn) return;
    Sentry.setUser({ id: ph.get_distinct_id() });
    Sentry.setTag("posthog_distinct_id", ph.get_distinct_id());
    Sentry.setTag("posthog_session_id", ph.get_session_id());
    ph.onSessionId((sessionId) => Sentry.setTag("posthog_session_id", sessionId));
  } catch { /* linking is best-effort */ }
}

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
    if (browserConfig.sentryDsn) {
      Sentry.init({
        dsn: browserConfig.sentryDsn,
        tracesSampleRate: 0.05,
        // Console breadcrumbs and request bodies can contain user content, so drop them.
        beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === "console" || breadcrumb.category === "ui.input" ? null : breadcrumb),
        beforeSend(event) {
          delete event.request?.data;
          delete event.request?.cookies;
          return event;
        },
      });
    }
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
      // Sentry events carry the same anonymous PostHog ids (no PII).
      linkSentry(posthog);
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
  const eventId = Sentry.captureException(error);
  try { posthog.capture("app_error", { sentry_event_id: eventId }); } catch { /* best-effort */ }
}

export function TelemetryErrorBoundary({ children }: { children: ReactNode }) {
  return <Sentry.ErrorBoundary fallback={({ resetError }) => <main className="error-boundary"><h1>MOTIF</h1><p>Something went wrong while showing this view.</p><button onClick={resetError}>Try again</button></main>}>{children}</Sentry.ErrorBoundary>;
}
