import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts.css";
import "./styles/motif.css";
import { App } from "./App";
import { TelemetryErrorBoundary } from "./telemetry";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TelemetryErrorBoundary><App /></TelemetryErrorBoundary>
  </StrictMode>,
);
