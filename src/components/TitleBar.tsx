import { useEffect, useState } from "react";
import { Cpu, Minus, Square, Copy, X } from "lucide-react";
import type { Lang } from "../types";
import { translate } from "../i18n";

interface TitleBarProps {
  lang: Lang;
  onToggleLang: () => void;
  mcpToolCount: number;
  connected: boolean;
  onClickWordmark: () => void;
  onClickMcp: () => void;
  standaloneRelease?: boolean;
}

export function TitleBar({
  lang,
  onToggleLang,
  mcpToolCount,
  connected,
  onClickWordmark,
  onClickMcp,
  standaloneRelease = false,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const desktop = typeof window !== "undefined" ? window.motifDesktop : undefined;

  useEffect(() => {
    if (!desktop?.isElectron) return;
    desktop.isMaximized().then(setMaximized).catch(() => {});
    return desktop.onMaximizeChange(setMaximized);
  }, [desktop]);

  return (
    <header className="titlebar" role="banner">
      <div className="titlebar-drag">
        <button
          type="button"
          className="titlebar-brand"
          onClick={onClickWordmark}
          title="MOTIF"
        >
          <img src="./favicon.png" alt="" className="titlebar-logo" />
          <span className="titlebar-wordmark">MOTIF</span>
        </button>

        {!standaloneRelease && (
          <button
            type="button"
            className="titlebar-pill"
            onClick={onClickMcp}
            style={{ cursor: "pointer" }}
          >
            <span className={`mint-dot ${connected ? "" : "is-off"}`} />
            <Cpu size={12} />
            <span>MCP · {mcpToolCount} tools</span>
          </button>
        )}
      </div>

      <div className="titlebar-actions">
        <button
          type="button"
          className="titlebar-lang"
          onClick={onToggleLang}
          aria-label="Toggle language"
        >
          {translate(lang, "header.langSwitch")}
        </button>

        <div className="win-controls" aria-label="Window controls">
          <button
            type="button"
            className="win-btn"
            title="Minimize"
            aria-label="Minimize"
            onClick={() => desktop?.minimize()}
          >
            <Minus size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="win-btn"
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => desktop?.maximize().then(setMaximized)}
          >
            {maximized ? <Copy size={12} strokeWidth={1.75} /> : <Square size={12} strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            className="win-btn win-btn--close"
            title="Close"
            aria-label="Close"
            onClick={() => desktop?.close()}
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  );
}
