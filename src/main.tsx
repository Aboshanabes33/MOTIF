import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts.css";
import "./styles/motif.css";
import { App } from "./App";
import "./posthog";
import { TelemetryErrorBoundary } from "./telemetry";
import { AuthGate } from "./auth/AuthGate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TelemetryErrorBoundary><AuthGate><App /></AuthGate></TelemetryErrorBoundary>
  </StrictMode>,
);
