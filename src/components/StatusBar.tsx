import { useEffect, useState } from "react";
import type { Lang } from "../types";
import { translate } from "../i18n";

interface StatusBarProps {
  lang: Lang;
  connected: boolean;
  runtime: string;
  version: string;
}

function formatClock(date: Date, lang: Lang): string {
  return date.toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StatusBar({ lang, connected, runtime, version }: StatusBarProps) {
  const [clock, setClock] = useState(() => formatClock(new Date(), lang));

  useEffect(() => {
    setClock(formatClock(new Date(), lang));
    const timer = setInterval(() => setClock(formatClock(new Date(), lang)), 15_000);
    return () => clearInterval(timer);
  }, [lang]);

  return (
    <footer className="statusbar" role="status">
      <div className="statusbar-group">
        <span className={`mint-dot ${connected ? "" : "is-off"}`} style={{ width: 6, height: 6 }} />
        <span>{translate(lang, connected ? "status.connected" : "status.offline")}</span>
        <span>·</span>
        <span>MOTIF {version} ({runtime})</span>
      </div>

      <div className="statusbar-group">
        <span className="statusbar-shortcuts">{translate(lang, "status.shortcuts")}</span>
        <span className="statusbar-clock">{clock}</span>
      </div>
    </footer>
  );
}
