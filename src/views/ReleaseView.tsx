import { useState } from "react";
import {
  Download,
  ExternalLink,
  Copy,
  Check,
  Monitor,
  ShieldCheck,
  Cpu,
  Terminal,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import type { Lang, McpStatusPayload, ReleasesPayload } from "../types";
import { translate } from "../i18n";

interface ReleaseViewProps {
  lang: Lang;
  releases: ReleasesPayload | null;
  mcpStatus: McpStatusPayload | null;
  standalone?: boolean;
  onOpenStandalone?: () => void;
  onBackToStudio?: () => void;
  onToast: (msg: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReleaseView({
  lang,
  releases,
  mcpStatus,
  standalone = false,
  onOpenStandalone,
  onBackToStudio,
  onToast,
}: ReleaseViewProps) {
  const [copiedId, setCopiedId] = useState("");
  const current = releases?.current;
  const githubList = releases?.githubReleases || [];

  const openUrl = (url: string) => {
    if (window.motifDesktop?.isElectron) {
      window.motifDesktop.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const copyString = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    onToast(translate(lang, "mcp.copied"));
    setTimeout(() => setCopiedId(""), 1800);
  };

  if (!current) {
    return <div className="content-card empty-state">Loading release information…</div>;
  }

  const highlights = lang === "ar" ? current.highlightsAr : current.highlights;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Hero Release & Windows Download Card */}
      <section className="content-card release-hero">
        <div className="release-hero-top">
          <div className="release-icon-row">
            <img src="./icon-512.png" alt="MOTIF App Icon" className="release-app-icon" />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="pill-badge pill-badge--accent">
                  <Sparkles size={11} />
                  {current.tag} · {translate(lang, "releases.latest")}
                </span>
                <span className="pill-badge">
                  <Monitor size={11} />
                  {current.platform}
                </span>
                <span className="pill-badge" style={{ fontFamily: "var(--font-mono)" }}>
                  Electron {current.electronVersion} · React {current.reactVersion} · MCP
                </span>
              </div>
              <h2
                style={{
                  margin: "8px 0 4px",
                  fontFamily: "var(--font-display)",
                  fontSize: 24,
                  fontWeight: 500,
                }}
              >
                {current.name}
              </h2>
              <p className="view-subtitle" style={{ margin: 0 }}>
                {translate(lang, "releases.subtitle")} · {formatDate(current.publishedAt, lang)}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {standalone && onBackToStudio ? (
              <button type="button" className="glass glass-btn" onClick={onBackToStudio}>
                {translate(lang, "releases.openStudio")}
              </button>
            ) : (
              onOpenStandalone && (
                <button type="button" className="btn" onClick={onOpenStandalone}>
                  <ArrowUpRight size={14} />
                  {translate(lang, "releases.standaloneLink")}
                </button>
              )
            )}
            <button type="button" className="btn" onClick={() => openUrl(current.releaseUrl)}>
              <ExternalLink size={14} />
              {translate(lang, "releases.viewOnGithub")}
            </button>
          </div>
        </div>

        {/* Windows Installer & Portable Download Targets */}
        <div className="release-dl-grid">
          {current.artifacts.map((art) => (
            <div
              key={art.id}
              className={`release-dl-card ${art.recommended ? "is-primary" : ""}`}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: 15 }}>
                  {lang === "ar" ? art.labelAr : art.label}
                </strong>
                {art.recommended && (
                  <span className="pill-badge pill-badge--accent">
                    {translate(lang, "releases.recommended")}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)" }}>
                {art.fileName} ({art.arch})
              </div>
              <p className="inspector-body" style={{ margin: 0, flex: 1 }}>
                {art.note}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className={`btn ${art.recommended ? "btn--primary" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => openUrl(art.url)}
                >
                  <Download size={15} />
                  {translate(
                    lang,
                    art.kind === "installer" ? "releases.downloadInstaller" : "releases.downloadPortable",
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What's New + Requirements */}
      <div className="two-col-grid">
        <section className="content-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <strong style={{ fontSize: 15 }}>{translate(lang, "releases.whatsNew")}</strong>
          <ul style={{ margin: 0, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 8, color: "var(--ink-secondary)" }}>
            {highlights.map((line, i) => (
              <li key={i} style={{ lineHeight: 1.5 }}>
                {line}
              </li>
            ))}
          </ul>
        </section>

        <section className="content-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={16} color="var(--accent)" />
            <strong style={{ fontSize: 15 }}>{translate(lang, "releases.requirements")}</strong>
          </div>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-key">OS</span>
              <span className="kv-val">{current.requirements.os}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">CPU & RAM</span>
              <span className="kv-val">
                {current.requirements.cpu} · {current.requirements.ram}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Storage</span>
              <span className="kv-val">{current.requirements.disk}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">MCP AI Agents</span>
              <span className="kv-val">{current.requirements.mcp}</span>
            </div>
          </div>

          <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="kv-key" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Terminal size={12} />
                {translate(lang, "releases.buildCmdTitle")}
              </span>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ height: 26, padding: "0 8px", fontSize: 11.5 }}
                onClick={() => copyString("buildcmd", "npm install && npm run dist:win")}
              >
                {copiedId === "buildcmd" ? <Check size={12} /> : <Copy size={12} />}
                {translate(lang, copiedId === "buildcmd" ? "mcp.copied" : "mcp.copyConfig")}
              </button>
            </div>
            <pre className="code-block" dir="ltr" style={{ padding: "9px 12px" }}>
              npm install && npm run dist:win
            </pre>
          </div>
        </section>
      </div>

      {/* Post-install MCP Quickstart */}
      <section className="content-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Cpu size={16} color="var(--accent)" />
            <strong style={{ fontSize: 15 }}>{translate(lang, "releases.mcpQuickstart")}</strong>
          </div>
          {mcpStatus && (
            <button
              type="button"
              className="btn"
              onClick={() => copyString("mcpwin", JSON.stringify(mcpStatus.configs.claudeDesktop, null, 2))}
            >
              {copiedId === "mcpwin" ? <Check size={14} /> : <Copy size={14} />}
              {translate(lang, copiedId === "mcpwin" ? "mcp.copied" : "mcp.copyConfig")}
            </button>
          )}
        </div>
        <pre className="code-block" dir="ltr">
          {mcpStatus
            ? JSON.stringify(mcpStatus.configs.claudeDesktop, null, 2)
            : JSON.stringify(
                {
                  mcpServers: {
                    motif: {
                      command: "node",
                      args: ["C:\\Program Files\\MOTIF\\resources\\app.asar.unpacked\\mcp\\motif-mcp.mjs"],
                    },
                  },
                },
                null,
                2,
              )}
        </pre>
      </section>

      {/* Published GitHub Releases Archive (Live from Aboshanabes33/MOTIF) */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="section-label">
          <span>{translate(lang, "releases.githubHistory")} ({releases.repo})</span>
          <span>{githubList.length}</span>
        </div>

        {githubList.map((rel) => (
          <article key={rel.id} className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 15 }}>{rel.name}</strong>
                <span className={`pill-badge ${rel.prerelease ? "" : "pill-badge--accent"}`}>
                  {rel.tag} · {translate(lang, rel.prerelease ? "releases.prerelease" : "releases.latest")}
                </span>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                  {formatDate(rel.publishedAt, lang)}
                </span>
              </div>
              <button type="button" className="btn" onClick={() => openUrl(rel.url)}>
                <ExternalLink size={13} />
                GitHub
              </button>
            </div>

            {rel.summary && <p className="inspector-body" style={{ margin: 0 }}>{rel.summary}</p>}

            {rel.assets.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {rel.assets
                  .filter((a) => /\.exe$|\.zip$|\.msi$/i.test(a.name))
                  .map((asset) => (
                    <button
                      key={asset.name}
                      type="button"
                      className="btn"
                      onClick={() => openUrl(asset.downloadUrl)}
                    >
                      <Download size={13} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{asset.name}</span>
                      {asset.size > 0 && (
                        <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
                          ({formatBytes(asset.size)})
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            )}

            {rel.sha256 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)", wordBreak: "break-all" }}>
                  SHA-256: {rel.sha256}
                </code>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ height: 26, padding: "0 8px", fontSize: 11.5 }}
                  onClick={() => copyString(rel.id, rel.sha256)}
                >
                  {copiedId === rel.id ? <Check size={12} /> : <Copy size={12} />}
                  {translate(lang, copiedId === rel.id ? "mcp.copied" : "releases.copySha")}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
