import { useEffect, useState } from "react";
import { Cpu, Play, Copy, Check, Database, Terminal, Sparkles } from "lucide-react";
import type { Lang, McpStatusPayload } from "../types";
import { api } from "../api/client";
import { translate } from "../i18n";

interface McpViewProps {
  lang: Lang;
  mcpStatus: McpStatusPayload | null;
  focusBrandId?: string | null;
  onAfterInvoke: () => void;
  onToast: (msg: string) => void;
}

const DEFAULT_ARGS: Record<string, string> = {
  motif_status: "{}",
  list_brands: JSON.stringify({ includeLogo: false }, null, 2),
  get_brand: JSON.stringify({ brand: "Qafila" }, null, 2),
  get_brand_guidelines: JSON.stringify({ brand: "Qafila" }, null, 2),
  create_brand: JSON.stringify(
    {
      name: "Sahara Films · صحارى",
      tagline: "Documentary stories from the desert",
      colors: ["#c87d4b", "#f3dec0", "#1c2b2d"],
      audience: "Documentary & cinema viewers",
      voice: "Poetic, grounded, cinematic",
      channels: "YouTube, Festivals",
      notes: "Golden-hour grade with restrained serif titles.",
    },
    null,
    2,
  ),
  update_brand: JSON.stringify({ id: "b_qafila01", tagline: "Updated tagline via MCP" }, null, 2),
  delete_brand: JSON.stringify({ id: "b_replace_me" }, null, 2),
  list_projects: "{}",
  get_project: JSON.stringify({ project: "proj_launch_reel" }, null, 2),
  create_project: JSON.stringify(
    {
      name: "MCP Agent Test Reel",
      brandId: "b_qafila01",
      aspect: "9:16",
      summary: "Created directly through MOTIF MCP tool.",
    },
    null,
    2,
  ),
  update_project: JSON.stringify({ id: "proj_launch_reel", progress: 85, status: "rendering" }, null, 2),
  list_footage: "{}",
  add_footage: JSON.stringify({ name: "Agent_Imported_Clip.mp4", kind: "video", resolution: "3840×2160" }, null, 2),
  list_voice_notes: "{}",
  create_voice_note: JSON.stringify(
    {
      title: "Agent Brief Note",
      transcript: "Match Qafila Studio's mint palette and keep intro under 3 seconds.",
      brandId: "b_qafila01",
    },
    null,
    2,
  ),
  search_workspace: JSON.stringify({ query: "Qafila" }, null, 2),
};

export function McpView({
  lang,
  mcpStatus,
  focusBrandId,
  onAfterInvoke,
  onToast,
}: McpViewProps) {
  const [selectedTool, setSelectedTool] = useState("list_brands");
  const [argsText, setArgsText] = useState(DEFAULT_ARGS.list_brands);
  const [output, setOutput] = useState<string>("");
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [configTab, setConfigTab] = useState<"claudeDesktop" | "claudeCode" | "cursor" | "codex">("claudeDesktop");
  const [copiedKey, setCopiedKey] = useState("");

  const runTool = async (toolName: string, rawJson: string) => {
    setRunning(true);
    setError("");
    try {
      const parsed = rawJson.trim() ? JSON.parse(rawJson) : {};
      const res = await api.invokeMcpTool(toolName, parsed);
      setOutput(JSON.stringify(res.result, null, 2));
      setElapsedMs(res.elapsedMs);
      onAfterInvoke();
    } catch (err) {
      setError(err instanceof Error ? err.message : "MCP invocation failed");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (focusBrandId) {
      const args = JSON.stringify({ brand: focusBrandId }, null, 2);
      setSelectedTool("get_brand_guidelines");
      setArgsText(args);
      runTool("get_brand_guidelines", args);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBrandId]);

  const handleSelectTool = (name: string) => {
    setSelectedTool(name);
    setArgsText(DEFAULT_ARGS[name] || "{}");
    setError("");
  };

  const handleReadResource = async (uri: string) => {
    setRunning(true);
    setError("");
    try {
      const res = await api.readMcpResource(uri);
      setOutput(res.content.text);
      setElapsedMs(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read resource");
    } finally {
      setRunning(false);
    }
  };

  const activeConfigText = (() => {
    if (!mcpStatus) return "";
    if (configTab === "codex") return mcpStatus.configs.codexToml;
    return JSON.stringify(mcpStatus.configs[configTab], null, 2);
  })();

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    onToast(translate(lang, "mcp.copied"));
    setTimeout(() => setCopiedKey(""), 1800);
  };

  const [telemetry, setTelemetry] = useState<{ available: boolean; enabled: boolean } | null>(null);
  useEffect(() => {
    window.motifDesktop?.getTelemetry?.().then(setTelemetry).catch(() => {});
  }, []);

  const activeToolDef = mcpStatus?.tools.find((t) => t.name === selectedTool);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Live Status Banner + Quick Test Buttons */}
      <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="mint-dot" />
            <strong style={{ fontSize: 14.5 }}>{translate(lang, "mcp.statusLive")}</strong>
            {mcpStatus && (
              <span className="pill-badge pill-badge--accent">
                {mcpStatus.tools.length} tools · {mcpStatus.resources.length} resources · {mcpStatus.prompts.length} prompts
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setSelectedTool("list_brands");
                setArgsText(DEFAULT_ARGS.list_brands);
                runTool("list_brands", DEFAULT_ARGS.list_brands);
              }}
            >
              <Sparkles size={14} />
              {translate(lang, "mcp.quickTestBrands")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSelectedTool("motif_status");
                setArgsText("{}");
                runTool("motif_status", "{}");
              }}
            >
              {translate(lang, "mcp.quickTestStatus")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSelectedTool("list_projects");
                setArgsText("{}");
                runTool("list_projects", "{}");
              }}
            >
              {translate(lang, "mcp.quickTestProjects")}
            </button>
          </div>
        </div>

        {mcpStatus && (
          <div style={{ fontSize: 12, color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
            Entrypoint: node {mcpStatus.configs.scriptPath}
          </div>
        )}
      </div>

      {telemetry?.available && (
        <div className="content-card" style={{ padding: "12px 18px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={telemetry.enabled}
              onChange={(e) => {
                window.motifDesktop?.setTelemetry?.(e.target.checked).then(setTelemetry).catch(() => {});
              }}
            />
            <span>{translate(lang, "telemetry.label")}</span>
          </label>
          <p className="inspector-body" style={{ margin: "6px 0 0" }}>{translate(lang, "telemetry.hint")}</p>
        </div>
      )}

      {/* Interactive Tool Explorer + Live Output */}
      <div className="two-col-grid">
        <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Cpu size={16} color="var(--accent)" />
            <strong style={{ fontSize: 14 }}>{translate(lang, "mcp.toolsHeading")}</strong>
          </div>

          <div className="tab-strip">
            {(mcpStatus?.tools || []).map((tool) => (
              <button
                key={tool.name}
                type="button"
                className={`tab-pill ${selectedTool === tool.name ? "is-active" : ""}`}
                style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}
                onClick={() => handleSelectTool(tool.name)}
              >
                {tool.name}
              </button>
            ))}
          </div>

          {activeToolDef && (
            <p className="inspector-body" style={{ margin: 0 }}>
              {activeToolDef.description}
            </p>
          )}

          <label className="field">
            <span className="field-label">{translate(lang, "mcp.argsLabel")}</span>
            <textarea
              className="textarea"
              dir="ltr"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, minHeight: 110 }}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
            />
          </label>

          {error && <div className="error-banner">{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={running}
              onClick={() => runTool(selectedTool, argsText)}
            >
              <Play size={14} />
              {translate(lang, running ? "mcp.running" : "mcp.runTool")}
            </button>
          </div>
        </div>

        <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Terminal size={16} color="var(--accent)" />
              <strong style={{ fontSize: 14 }}>{translate(lang, "mcp.responseLabel")}</strong>
            </div>
            {elapsedMs !== null && (
              <span className="pill-badge" style={{ fontFamily: "var(--font-mono)" }}>
                {elapsedMs} ms
              </span>
            )}
          </div>

          <pre className="code-block" dir="ltr" style={{ flex: 1, minHeight: 220 }}>
            {output ||
              '// Click "Test: list_brands" or "Run Tool" to inspect the exact live JSON payload returned to Claude, Cursor, or Codex.'}
          </pre>

          {/* Exposed Resources */}
          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Database size={13} />
                {translate(lang, "mcp.resourcesHeading")}
              </span>
            </div>
            <div className="tab-strip">
              {(mcpStatus?.resources || []).slice(0, 8).map((res) => (
                <button
                  key={res.uri}
                  type="button"
                  className="tab-pill"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                  onClick={() => handleReadResource(res.uri)}
                  title={res.description}
                >
                  {res.uri}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Client Configuration Snippets (Claude Desktop, Claude Code, Cursor, Codex) */}
      <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14.5 }}>{translate(lang, "mcp.configHeading")}</strong>
          <div className="tab-strip">
            {(
              [
                ["claudeDesktop", "Claude Desktop"],
                ["claudeCode", "Claude Code (.mcp.json)"],
                ["cursor", "Cursor"],
                ["codex", "Codex (TOML)"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`tab-pill ${configTab === key ? "is-active" : ""}`}
                onClick={() => setConfigTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <pre className="code-block" dir="ltr">
          {activeConfigText || "Loading MCP configuration…"}
        </pre>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn"
            onClick={() => copyText("cfg", activeConfigText)}
            disabled={!activeConfigText}
          >
            {copiedKey === "cfg" ? <Check size={14} /> : <Copy size={14} />}
            {translate(lang, copiedKey === "cfg" ? "mcp.copied" : "mcp.copyConfig")}
          </button>
        </div>
      </div>
    </div>
  );
}
