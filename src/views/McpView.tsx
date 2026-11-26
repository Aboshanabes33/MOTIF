import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  Layers,
  Link2,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";
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

const CLIENT_BLURB: Record<string, { en: string; ar: string }> = {
  "claude-desktop": { en: "claude_desktop_config.json", ar: "claude_desktop_config.json" },
  "claude-code": { en: "~/.claude.json", ar: "~/.claude.json" },
  cursor: { en: "~/.cursor/mcp.json", ar: "~/.cursor/mcp.json" },
  windsurf: { en: "mcp_config.json", ar: "mcp_config.json" },
  vscode: { en: "Code/User/mcp.json", ar: "Code/User/mcp.json" },
  codex: { en: "~/.codex/config.toml", ar: "~/.codex/config.toml" },
};

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
  video_stack: JSON.stringify({ includeDocs: false }, null, 2),
  video_stack_doc: JSON.stringify({ doc: "scenes" }, null, 2),
  video_edit_status: "{}",
  video_edit_plan: JSON.stringify({ name: "Launch Reel", mode: "full" }, null, 2),
  video_edit_stage: JSON.stringify({ stage: "cut", work: "/Users/me/Documents/video-edit/projects/Launch Reel" }, null, 2),
  video_edit_run: JSON.stringify({ stage: "cut", work: "/Users/me/Documents/video-edit/projects/Launch Reel" }, null, 2),
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
  const [clients, setClients] = useState(mcpStatus?.clients || []);
  const [busyClient, setBusyClient] = useState("");
  const [verifyNote, setVerifyNote] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (mcpStatus?.clients) setClients(mcpStatus.clients);
  }, [mcpStatus?.clients]);

  const addMcp = async (client: string) => {
    setBusyClient(client);
    setError("");
    try {
      const res = await api.installMcpClient(client);
      setClients(res.clients);
      setVerifyNote(
        res.verify?.ok
          ? `✓ ${res.verify.serverInfo?.name || "motif"} · ${res.verify.toolCount} tools${res.verify.hasStack ? " · stack" : ""} · ${res.verify.elapsedMs} ms`
          : `✗ ${res.verify?.error || "handshake failed"}`,
      );
      onToast(
        translate(lang, res.alreadyConnected ? "mcp.restart" : "mcp.addedToast")
          .replace("{name}", res.label),
      );
      onAfterInvoke();
    } catch (err) {
      const msg = err instanceof Error ? err.message : translate(lang, "mcp.installFailed");
      setError(msg);
      onToast(msg);
    } finally {
      setBusyClient("");
    }
  };

  const removeMcp = async (client: string) => {
    setBusyClient(client);
    setError("");
    try {
      const res = await api.removeMcpClient(client);
      setClients(res.clients);
      onToast(translate(lang, "mcp.removedToast").replace("{name}", res.label));
    } catch (err) {
      setError(err instanceof Error ? err.message : translate(lang, "mcp.installFailed"));
    } finally {
      setBusyClient("");
    }
  };



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

  const copyStackUri = (uri: string) => copyText(uri, uri);

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

      {/* One-click "Add MCP" — writes MOTIF into the chosen agent's own config */}
      <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link2 size={16} color="var(--accent)" />
          <strong style={{ fontSize: 14.5 }}>{translate(lang, "mcp.connectTitle")}</strong>
        </div>
        <p className="inspector-body" style={{ margin: 0 }}>
          {translate(lang, "mcp.connectSub")}
        </p>

        {error && <div className="error-banner">{error}</div>}

        {verifyNote && (
          <code dir="ltr" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-muted)" }}>
            {verifyNote}
          </code>
        )}

        <div className="three-col-grid">
          {clients.map((client) => {
            const busy = busyClient === client.id;
            const blurb = CLIENT_BLURB[client.id]?.[lang] || client.configPath;
            return (
              <article
                key={client.id}
                className="stage-row"
                style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 13.5 }}>{client.label}</strong>
                  {client.configured ? (
                    <span className="pill-badge pill-badge--accent">
                      <CheckCircle2 size={11} /> {translate(lang, "mcp.connected")}
                    </span>
                  ) : client.installed ? (
                    <span className="pill-badge">{translate(lang, "mcp.detected")}</span>
                  ) : (
                    <span className="pill-badge" style={{ color: "var(--ink-muted)" }}>
                      {translate(lang, "mcp.notFound")}
                    </span>
                  )}
                </div>

                <code
                  dir="ltr"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--ink-muted)",
                    wordBreak: "break-all",
                  }}
                  title={client.configPath}
                >
                  {blurb}
                </code>

                {client.configured ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy}
                      onClick={() => addMcp(client.id)}
                      title="Rewrite the entry (keeps a backup)"
                    >
                      {busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                      {translate(lang, "mcp.addMcp")}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy}
                      onClick={() => removeMcp(client.id)}
                    >
                      <Trash2 size={13} />
                      {translate(lang, "mcp.removeMcp")}
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy}
                      onClick={() => addMcp(client.id)}
                    >
                      {busy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
                      {translate(lang, "mcp.addMcp")}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* The stack itself, served inside MCP */}
      <div className="content-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={16} color="var(--accent)" />
          <strong style={{ fontSize: 14.5 }}>{translate(lang, "mcp.stackTitle")}</strong>
        </div>
        <p className="inspector-body" style={{ margin: 0 }}>
          {translate(lang, "mcp.stackSub")}
        </p>

        <div className="tab-strip">
          {[
            ["motif://video/skill", translate(lang, "mcp.stackSkill")],
            ["motif://video/stack", "manifest"],
            ["motif://video/bundle", translate(lang, "mcp.stackBundle")],
            ["motif://video/docs/rules", "rules"],
            ["motif://video/docs/scenes", "scenes"],
            ["motif://video/docs/simple", "simple"],
            ["motif://video/docs/collage", "collage"],
          ].map(([uri, label]) => (
            <button
              key={uri}
              type="button"
              className="tab-pill"
              style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
              onClick={() => handleReadResource(uri)}
              onContextMenu={(e) => {
                e.preventDefault();
                copyStackUri(uri);
              }}
              title={uri}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              setRunning(true);
              try {
                const res = await api.getMcpPrompt("video_stack_brief", {});
                setOutput(res.messages[0]?.content?.text || JSON.stringify(res, null, 2));
                setElapsedMs(0);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Prompt failed");
              } finally {
                setRunning(false);
              }
            }}
            disabled={running}
          >
            <Sparkles size={13} />
            {translate(lang, "mcp.stackPrompt")}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => handleReadResource("motif://video/projects")}
          >
            <Database size={13} />
            motif://video/projects
          </button>
        </div>
      </div>

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
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setShowManual((v) => !v)}
          >
            {translate(lang, "mcp.manual")}
          </button>
          {showManual && (
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
          )}
        </div>

        {showManual && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
