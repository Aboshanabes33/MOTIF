import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const posthogKey = process.env.POSTHOG_API_KEY;
const posthogHost = process.env.POSTHOG_HOST;

const loggerProvider =
  posthogKey && posthogHost
    ? new LoggerProvider({
        resource: resourceFromAttributes({
          "service.name": "motif-local-backend",
          "service.version": process.env.npm_package_version || "unknown",
          "deployment.environment": process.env.NODE_ENV || "development",
        }),
        processors: [
          new BatchLogRecordProcessor(
            new OTLPLogExporter({
              url: `${posthogHost.replace(/\/$/, "")}/i/v1/logs`,
              headers: { Authorization: `Bearer ${posthogKey}` },
            }),
          ),
        ],
      })
    : null;

const posthogLogger = loggerProvider?.getLogger("motif-posthog-logs");

if (!posthogLogger && process.env.NODE_ENV !== "production") {
  const missingVariable = posthogKey ? "POSTHOG_HOST" : "POSTHOG_API_KEY";
  console.warn(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

function emitLog(record) {
  try {
    posthogLogger?.emit(record);
  } catch {
    // Log export must never interrupt the local backend.
  }
}

export function logBackendStarted({ runtime }) {
  emitLog({
    severityText: "INFO",
    body: "MOTIF local backend started",
    attributes: {
      event: "backend_started",
      runtime,
    },
  });
}

export function logVideoStageCompleted({ stage, result }) {
  emitLog({
    severityText: result.gate === "ok" ? "INFO" : "WARN",
    body: "Video editing stage completed",
    attributes: {
      event: "video_stage_completed",
      stage,
      gate: result.gate,
      succeeded: result.gate === "ok",
      elapsed_ms: result.elapsedMs,
    },
  });
}

export async function shutdownPostHogLogs() {
  if (!loggerProvider) return;
  try {
    await loggerProvider.forceFlush();
  } catch {
    // Delivery is best-effort during shutdown.
  }
  try {
    await loggerProvider.shutdown();
  } catch {
    // Delivery is best-effort during shutdown.
  }
}
