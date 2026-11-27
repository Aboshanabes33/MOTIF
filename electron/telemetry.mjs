// Opt-in telemetry (PostHog + Sentry). Off by default, no-op without keys.
// Only sends: app version, OS platform/arch, a random install id, event names.
// Never sends file paths, project/brand names, transcripts, API keys or any user content.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readDefaults() {
  try {
    return JSON.parse(fs.readFileSync(path.join(here, "telemetry.config.json"), "utf8"));
  } catch {
    return {};
  }
}

export function createTelemetry({ userDataDir, version, platform, arch }) {
  const defaults = readDefaults();
  const cfg = {
    posthogKey: process.env.POSTHOG_KEY || defaults.posthogKey || "",
    posthogHost: (process.env.POSTHOG_HOST || defaults.posthogHost || "").replace(/\/+$/, ""),
    sentryDsn: process.env.SENTRY_DSN || defaults.sentryDsn || "",
  };
  const file = path.join(userDataDir, "telemetry.json");

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      return { enabled: raw.enabled === true, installId: String(raw.installId || "") };
    } catch {
      return { enabled: false, installId: "" };
    }
  }
  function save(state) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  let state = load();
  let sentryStarted = false;

  const available = () => Boolean(cfg.posthogKey && cfg.posthogHost) || Boolean(cfg.sentryDsn);

  async function startSentry() {
    if (sentryStarted || !cfg.sentryDsn || !state.enabled) return;
    try {
      const Sentry = await import("@sentry/electron/main");
      Sentry.init({
        dsn: cfg.sentryDsn,
        release: `motif@${version}`,
        sendDefaultPii: false,
        maxBreadcrumbs: 0,
        beforeBreadcrumb: () => null,
        beforeSend(event) {
          delete event.user;
          delete event.request;
          delete event.server_name;
          delete event.contexts?.device?.name;
          const frames = event.exception?.values?.flatMap((v) => v.stacktrace?.frames || []) || [];
          for (const f of frames) {
            if (f.filename) f.filename = f.filename.split(/[\\/]/).pop();
            delete f.abs_path;
            delete f.vars;
          }
          for (const v of event.exception?.values || []) {
            if (v.value) v.value = String(v.value).slice(0, 120).replace(/[A-Za-z]:[\\/][^\s]*|\/[^\s]*/g, "<path>");
          }
          delete event.message;
          return event;
        },
      });
      sentryStarted = true;
    } catch {
      /* sentry unavailable: stay silent */
    }
  }

  async function capture(event, props = {}) {
    if (!state.enabled || !cfg.posthogKey || !cfg.posthogHost) return;
    try {
      await fetch(`${cfg.posthogHost}/capture/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: cfg.posthogKey,
          event,
          distinct_id: state.installId,
          properties: { app_version: version, platform, arch, $process_person_profile: false, ...props },
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* offline: drop */
    }
  }

  return {
    status: () => ({ available: available(), enabled: state.enabled && available() }),
    async setEnabled(enabled) {
      const on = enabled === true && available();
      state = {
        enabled: on,
        installId: on ? state.installId || crypto.randomUUID() : state.installId,
      };
      save(state);
      if (on) {
        await startSentry();
        await capture("telemetry_enabled");
      }
      return this.status();
    },
    async start() {
      await startSentry();
      await capture("app_started");
    },
  };
}
