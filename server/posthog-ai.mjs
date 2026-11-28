import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const posthogKey = process.env.POSTHOG_API_KEY;
const posthogHost = process.env.POSTHOG_HOST;

// posthog-node is loaded only when configured, so the packaged app (no node_modules) still starts.
let posthog = null;
if (posthogKey && posthogHost) {
  try {
    const { PostHog } = await import("posthog-node");
    posthog = new PostHog(posthogKey, { host: posthogHost, privacyMode: false });
  } catch {
    posthog = null;
  }
}

if (!posthog && process.env.NODE_ENV !== "production") {
  const missingVariable = posthogKey ? "POSTHOG_HOST" : "POSTHOG_API_KEY";
  console.warn(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

function readTranscript(work) {
  try {
    const transcript = JSON.parse(fs.readFileSync(path.join(work, "a.json"), "utf8"));
    return {
      model: typeof transcript.model === "string" ? transcript.model : "large-v3",
      text: typeof transcript.text === "string" ? transcript.text : "",
    };
  } catch {
    return null;
  }
}

export function captureTranscription({ distinctId, work, result }) {
  if (!posthog || !distinctId) return;

  const transcript = result.gate === "ok" ? readTranscript(work) : null;
  const properties = {
    $ai_trace_id: randomUUID(),
    $ai_session_id: null,
    $ai_span_id: randomUUID(),
    $ai_span_name: "video_transcription",
    $ai_model: transcript?.model || "large-v3",
    $ai_provider: process.platform === "darwin" && process.arch === "arm64" ? "mlx-whisper" : "faster-whisper",
    $ai_latency: result.elapsedMs / 1000,
  };

  if (result.gate === "ok") {
    if (transcript?.text) {
      properties.$ai_output_choices = [{ role: "assistant", content: transcript.text }];
    }
  } else {
    properties.$ai_is_error = true;
    properties.$ai_error = `Transcription pipeline exited with code ${result.exitCode}`;
  }

  try {
    posthog.capture({ distinctId, event: "$ai_generation", properties });
  } catch {
    // AI observability must never interrupt the transcription workflow.
  }
}

export async function shutdownPostHog() {
  try {
    await posthog?.shutdown();
  } catch {
    // Avoid failing server shutdown when telemetry is unavailable.
  }
}
