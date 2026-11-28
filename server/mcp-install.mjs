/**
 * One-click MCP registration — "Add MCP" writes MOTIF into the chosen agent.
 *
 * The desktop UI (and `POST /api/mcp/connect`) call this instead of asking the
 * user to hand-edit JSON/TOML. Every write is scoped to a known client config
 * path, keeps a timestamped backup next to the original, and refuses to touch a
 * file that is not valid JSON instead of clobbering it.
 *
 * Supported agents: OpenCode, Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Codex.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const SERVER_KEY = "motif";

const BACKUP_STAMP = () => new Date().toISOString().replace(/[:.]/g, "-");

function P(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Config file for every supported agent, per platform. */
export function clientConfigPaths({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  const p = P(platform);
  const appData = env.APPDATA || p.join(home, "AppData", "Roaming");
  const macSupport = p.join(home, "Library", "Application Support");
  const xdgConfig = env.XDG_CONFIG_HOME || p.join(home, ".config");
  return {
    opencode: p.join(xdgConfig, "opencode", "opencode.json"),
    "claude-desktop":
      platform === "win32"
        ? p.join(appData, "Claude", "claude_desktop_config.json")
        : platform === "darwin"
          ? p.join(macSupport, "Claude", "claude_desktop_config.json")
          : p.join(home, ".config", "Claude", "claude_desktop_config.json"),
    "claude-code": p.join(home, ".claude.json"),
    cursor: p.join(home, ".cursor", "mcp.json"),
    windsurf: p.join(home, ".codeium", "windsurf", "mcp_config.json"),
    vscode:
      platform === "win32"
        ? p.join(appData, "Code", "User", "mcp.json")
        : platform === "darwin"
          ? p.join(macSupport, "Code", "User", "mcp.json")
          : p.join(home, ".config", "Code", "User", "mcp.json"),
    codex: p.join(home, ".codex", "config.toml"),
  };
}

const LABELS = {
  opencode: "OpenCode",
  "claude-desktop": "Claude Desktop",
  "claude-code": "Claude Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  vscode: "VS Code",
  codex: "Codex",
};

const KINDS = {
  opencode: "opencode",
  "claude-desktop": "json",
  "claude-code": "json",
  cursor: "json",
  windsurf: "json",
  vscode: "json",
  codex: "toml",
};

/** Where each agent keeps its server map inside the JSON config. */
const JSON_KEYS = {
  "claude-desktop": "mcpServers",
  "claude-code": "mcpServers",
  cursor: "mcpServers",
  windsurf: "mcpServers",
  vscode: "servers",
};

/** The agent-facing descriptor list (also rendered by the MCP view). */
export function clientDefs(opts = {}) {
  const paths = clientConfigPaths(opts);
  return Object.keys(LABELS).map((id) => ({
    id,
    label: LABELS[id],
    kind: KINDS[id],
    configPath: paths[id],
    key: JSON_KEYS[id] || "mcp_servers",
  }));
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function backupFile(file) {
  const backup = `${file}.motif-backup-${BACKUP_STAMP()}`;
  fs.copyFileSync(file, backup);
  return backup;
}

/** The entry MOTIF writes into the agent config. */
export function motifEntry({ mcpScriptPath, dataDir, kind = "json" } = {}) {
  const entry = {
    command: "node",
    args: [mcpScriptPath],
  };
  if (dataDir) entry.env = { MOTIF_DATA: dataDir };
  if (kind === "vscode") return { type: "stdio", ...entry };
  return entry;
}

function readJsonConfig(file) {
  const raw = readTextIfExists(file);
  if (raw === null || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("root must be a JSON object");
    }
    return parsed;
  } catch (err) {
    throw Object.assign(
      new Error(
        `Config at ${file} is not valid JSON (${err.message}). Open it, fix it, or use the manual snippet — MOTIF left the file untouched.`,
      ),
      { status: 422, code: "INVALID_CONFIG" },
    );
  }
}

function findJsonEntry(cfg, def) {
  const map = cfg?.[def.key];
  if (!map || typeof map !== "object") return null;
  return map[SERVER_KEY] || null;
}

function openCodeMap(cfg) {
  if (cfg?.mcp?.servers && typeof cfg.mcp.servers === "object") return cfg.mcp.servers;
  if (!cfg.mcp || typeof cfg.mcp !== "object") cfg.mcp = {};
  return cfg.mcp;
}

function openCodeEntry({ mcpScriptPath, dataDir, v2 = false }) {
  return {
    type: "local",
    command: ["node", mcpScriptPath],
    ...(dataDir ? { environment: { MOTIF_DATA: dataDir } } : {}),
    ...(v2 ? {} : { enabled: true }),
  };
}

function tomlEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function tomlBlock({ mcpScriptPath, dataDir }) {
  const lines = [
    `[mcp_servers.${SERVER_KEY}]`,
    `command = "node"`,
    `args = ["${tomlEscape(mcpScriptPath)}"]`,
  ];
  if (dataDir) {
    lines.push("", `[mcp_servers.${SERVER_KEY}.env]`, `MOTIF_DATA = "${tomlEscape(dataDir)}"`);
  }
  return lines.join("\n");
}

function replaceTomlBlock(text, block) {
  const lines = text.split(/\r?\n/);
  const header = `[mcp_servers.${SERVER_KEY}]`;
  const start = lines.findIndex((l) => l.trim() === header);
  if (start === -1) {
    const base = text.replace(/\s+$/, "");
    return `${base}${base ? "\n\n" : ""}${block}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("[") && !trimmed.startsWith(`[mcp_servers.${SERVER_KEY}`)) {
      end = i;
      break;
    }
  }
  const before = lines.slice(0, start).join("\n");
  const after = lines.slice(end).join("\n");
  return `${before}${before ? "\n" : ""}${block}\n${after ? `\n${after.replace(/^\n+/, "")}` : ""}`;
}

function stripTomlBlock(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `[mcp_servers.${SERVER_KEY}]`);
  if (start === -1) return text;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("[") && !trimmed.startsWith(`[mcp_servers.${SERVER_KEY}`)) {
      end = i;
      break;
    }
  }
  const out = [...lines.slice(0, start), ...lines.slice(end)].join("\n");
  return `${out.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "")}\n`;
}

function resolveHome({ home, env }) {
  if (home) return home;
  if (env?.MOTIF_MCP_HOME) return env.MOTIF_MCP_HOME;
  return os.homedir();
}

function resolveContext(opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const home = resolveHome({ home: opts.home, env });
  return { env, platform, home };
}

/** Detect which agents are installed on this machine and whether MOTIF is already added. */
export function detectClients({ mcpScriptPath, dataDir, ...opts } = {}) {
  const ctx = resolveContext(opts);
  return clientDefs(ctx).map((def) => {
    let installed = false;
    let configured = false;
    let upToDate = false;
    try {
      installed = fs.existsSync(def.configPath) || fs.existsSync(path.dirname(def.configPath));
    } catch {
      installed = false;
    }
    if (def.kind === "opencode") {
      try {
        const cfg = readJsonConfig(def.configPath);
        const entry = cfg.mcp?.servers?.[SERVER_KEY] || cfg.mcp?.[SERVER_KEY] || null;
        configured = Boolean(entry);
        upToDate = configured && (!mcpScriptPath || JSON.stringify(entry) === JSON.stringify(openCodeEntry({ mcpScriptPath, dataDir, v2: Boolean(cfg.mcp?.servers) })));
      } catch {
        configured = false;
      }
    } else if (def.kind === "json") {
      try {
        const cfg = readJsonConfig(def.configPath);
        const entry = findJsonEntry(cfg, def);
        configured = Boolean(entry);
        if (entry && mcpScriptPath) {
          const wanted = motifEntry({ mcpScriptPath, dataDir, kind: def.id });
          upToDate = JSON.stringify(entry) === JSON.stringify(wanted);
        } else if (entry) {
          upToDate = true;
        }
      } catch {
        configured = false;
      }
    } else {
      const text = readTextIfExists(def.configPath) || "";
      configured = text.includes(`[mcp_servers.${SERVER_KEY}]`);
      upToDate = configured && mcpScriptPath ? text.includes(mcpScriptPath.replace(/\\/g, "\\\\")) : configured;
    }
    return { ...def, installed, configured, upToDate };
  });
}

/** Add MOTIF to one agent's config (idempotent, backup kept). */
export function installClient({ client, mcpScriptPath, dataDir, ...opts } = {}) {
  const ctx = resolveContext(opts);
  const def = clientDefs(ctx).find((d) => d.id === client);
  if (!def) {
    throw Object.assign(new Error(`Unknown MCP client: ${client || "(empty)"}`), {
      status: 400,
      code: "UNKNOWN_CLIENT",
    });
  }
  if (!mcpScriptPath) {
    throw Object.assign(new Error("mcpScriptPath is required"), { status: 500 });
  }

  fs.mkdirSync(path.dirname(def.configPath), { recursive: true });

  if (def.kind === "opencode") {
    const cfg = readJsonConfig(def.configPath);
    const existed = fs.existsSync(def.configPath);
    const backup = existed ? backupFile(def.configPath) : null;
    const v2 = Boolean(cfg.mcp?.servers && typeof cfg.mcp.servers === "object");
    const map = openCodeMap(cfg);
    const already = Boolean(v2 ? map.servers?.[SERVER_KEY] : map[SERVER_KEY]);
    const entry = openCodeEntry({ mcpScriptPath, dataDir, v2 });
    if (v2) map[SERVER_KEY] = entry;
    else {
      cfg.$schema ||= "https://opencode.ai/config.json";
      map[SERVER_KEY] = entry;
    }
    fs.writeFileSync(def.configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    return { ok: true, client: def.id, label: def.label, configPath: def.configPath, backup, alreadyConnected: already, restartRequired: true, entry };
  }

  if (def.kind === "json") {
    const cfg = readJsonConfig(def.configPath);
    const existed = fs.existsSync(def.configPath);
    const backup = existed ? backupFile(def.configPath) : null;
    const map = cfg[def.key] && typeof cfg[def.key] === "object" ? cfg[def.key] : {};
    const already = Boolean(map[SERVER_KEY]);
    map[SERVER_KEY] = motifEntry({ mcpScriptPath, dataDir, kind: def.id });
    cfg[def.key] = map;
    fs.writeFileSync(def.configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    return {
      ok: true,
      client: def.id,
      label: def.label,
      configPath: def.configPath,
      backup,
      alreadyConnected: already,
      restartRequired: true,
      entry: map[SERVER_KEY],
    };
  }

  const existing = readTextIfExists(def.configPath);
  const backup = existing !== null ? backupFile(def.configPath) : null;
  const already = Boolean(existing && existing.includes(`[mcp_servers.${SERVER_KEY}]`));
  const next = replaceTomlBlock(existing || "", tomlBlock({ mcpScriptPath, dataDir }));
  fs.writeFileSync(def.configPath, next, "utf8");
  return {
    ok: true,
    client: def.id,
    label: def.label,
    configPath: def.configPath,
    backup,
    alreadyConnected: already,
    restartRequired: true,
    entry: motifEntry({ mcpScriptPath, dataDir, kind: def.id }),
  };
}

/** Remove MOTIF from one agent's config, leaving every other server intact. */
export function removeClient({ client, ...opts } = {}) {
  const ctx = resolveContext(opts);
  const def = clientDefs(ctx).find((d) => d.id === client);
  if (!def) {
    throw Object.assign(new Error(`Unknown MCP client: ${client || "(empty)"}`), {
      status: 400,
      code: "UNKNOWN_CLIENT",
    });
  }
  if (!fs.existsSync(def.configPath)) {
    return { ok: true, client: def.id, label: def.label, configPath: def.configPath, removed: false };
  }

  if (def.kind === "opencode") {
    const cfg = readJsonConfig(def.configPath);
    const v2 = Boolean(cfg.mcp?.servers && typeof cfg.mcp.servers === "object");
    const map = v2 ? cfg.mcp.servers : cfg.mcp;
    if (!map || !map[SERVER_KEY]) return { ok: true, client: def.id, label: def.label, configPath: def.configPath, removed: false };
    const backup = backupFile(def.configPath);
    delete map[SERVER_KEY];
    fs.writeFileSync(def.configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    return { ok: true, client: def.id, label: def.label, configPath: def.configPath, backup, removed: true };
  }

  if (def.kind === "json") {
    const cfg = readJsonConfig(def.configPath);
    const map = cfg[def.key];
    if (!map || !map[SERVER_KEY]) {
      return { ok: true, client: def.id, label: def.label, configPath: def.configPath, removed: false };
    }
    const backup = backupFile(def.configPath);
    delete map[SERVER_KEY];
    fs.writeFileSync(def.configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    return { ok: true, client: def.id, label: def.label, configPath: def.configPath, backup, removed: true };
  }

  const existing = readTextIfExists(def.configPath) || "";
  if (!existing.includes(`[mcp_servers.${SERVER_KEY}]`)) {
    return { ok: true, client: def.id, label: def.label, configPath: def.configPath, removed: false };
  }
  const backup = backupFile(def.configPath);
  fs.writeFileSync(def.configPath, stripTomlBlock(existing), "utf8");
  return { ok: true, client: def.id, label: def.label, configPath: def.configPath, backup, removed: true };
}

/**
 * Prove the connection before telling the user it works: boot the stdio server
 * exactly the way the agent will, handshake, and count what it exposes.
 * Never throws — a failed verify is reported, not fatal.
 */
export function verifyMcpServer({ mcpScriptPath, dataDir, timeoutMs = 8000 } = {}) {
  if (!mcpScriptPath || !fs.existsSync(mcpScriptPath)) {
    return Promise.resolve({ ok: false, error: `MCP entrypoint not found: ${mcpScriptPath || "(empty)"}` });
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [mcpScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(dataDir ? { MOTIF_DATA: dataDir } : {}), MOTIF_CLEAN_INIT: "1" },
    });
    let buffer = "";
    let done = false;
    const finish = (payload) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      resolve({ ...payload, elapsedMs: Date.now() - started });
    };
    const timer = setTimeout(() => finish({ ok: false, error: `Handshake timed out after ${timeoutMs} ms` }), timeoutMs);

    child.on("error", (err) => finish({ ok: false, error: String(err?.message || err) }));
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1 && msg.result) {
          child.stdin.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`,
          );
        }
        if (msg.id === 2 && msg.result) {
          const tools = (msg.result.tools || []).map((t) => t.name);
          finish({
            ok: true,
            serverInfo: { name: "motif" },
            toolCount: tools.length,
            hasStack: tools.includes("video_stack") && tools.includes("video_edit_status"),
          });
        }
      }
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", clientInfo: { name: "MOTIF verify", version: "1" } },
      })}\n`,
    );
  });
}
