/**
 * MOTIF Portable Windows Desktop Launcher (runs inside bundled Node.js 24 LTS).
 *
 * - Reuses an already-running MOTIF backend if healthy (single-instance).
 * - Otherwise boots the embedded HTTP/SSE + React + MCP server on 127.0.0.1.
 * - Opens MOTIF in a standalone Windows app window via Microsoft Edge / Chrome
 *   (--app mode, isolated profile) and shuts down the backend cleanly on window close.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startMotifServer } from "../server/motif-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = process.env.MOTIF_APP_DIR
  ? path.resolve(process.env.MOTIF_APP_DIR)
  : path.resolve(__dirname, "..");

function getDataDir() {
  if (process.env.MOTIF_DATA) return path.resolve(process.env.MOTIF_DATA);
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "MOTIF", "workspace");
  }
  return path.join(os.homedir(), ".motif", "workspace");
}

function getProfileDir() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "MOTIF", "window-profile");
  }
  return path.join(os.tmpdir(), "motif-window-profile");
}

function getLogPath() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "MOTIF", "motif.log");
  }
  return path.join(os.tmpdir(), "motif.log");
}

function logLine(msg) {
  try {
    const logPath = getLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
  } catch {
    // ignore logging failure
  }
}

async function checkExistingServer(dataDir) {
  const serverJson = path.join(dataDir, "home", "server.json");
  if (!fs.existsSync(serverJson)) return null;
  try {
    const info = JSON.parse(fs.readFileSync(serverJson, "utf8"));
    if (!info?.url) return null;
    const res = await fetch(`${info.url}/api/health`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.ok && body?.app === "MOTIF") return String(info.url);
  } catch {
    return null;
  }
  return null;
}

export function findWindowsAppBrowser(env = process.env) {
  const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const pf = env.ProgramFiles || "C:\\Program Files";
  const local = env.LOCALAPPDATA || "";

  const candidates = [
    path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(local, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pf, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    path.join(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
  ];

  for (const exe of candidates) {
    if (exe && fs.existsSync(exe)) return exe;
  }
  return null;
}

function launchDesktopWindow(url) {
  const profileDir = getProfileDir();
  fs.mkdirSync(profileDir, { recursive: true });

  if (process.platform === "win32") {
    const browser = findWindowsAppBrowser();
    if (browser) {
      logLine(`Opening MOTIF standalone app window via ${browser}`);
      const child = spawn(
        browser,
        [
          `--app=${url}`,
          `--user-data-dir=${profileDir}`,
          "--window-size=1360,860",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-features=msEdgeSidebarV2",
        ],
        {
          stdio: "ignore",
          windowsHide: false,
        },
      );
      return { child, tracked: true };
    }

    logLine("No Chromium app browser found; falling back to default Windows browser");
    spawn("cmd.exe", ["/c", "start", "", url], {
      stdio: "ignore",
      windowsHide: true,
      detached: true,
    }).unref();
    return { child: null, tracked: false };
  }

  return { child: null, tracked: false };
}

async function bootServer(dataDir) {
  const staticDir = path.join(APP_DIR, "dist-web");
  const mcpScriptPath = path.join(APP_DIR, "mcp", "motif-mcp.mjs");
  const preferredPort = Number(process.env.MOTIF_PORT || 8795);

  try {
    return await startMotifServer({
      host: "127.0.0.1",
      port: preferredPort,
      dataDir,
      staticDir,
      mcpScriptPath,
      runtime: "desktop-win",
    });
  } catch (err) {
    if (err?.code === "EADDRINUSE") {
      return await startMotifServer({
        host: "127.0.0.1",
        port: 0,
        dataDir,
        staticDir,
        mcpScriptPath,
        runtime: "desktop-win",
      });
    }
    throw err;
  }
}

async function main() {
  const dataDir = getDataDir();
  const existingUrl = await checkExistingServer(dataDir);
  if (existingUrl) {
    logLine(`Reusing running MOTIF instance at ${existingUrl}`);
    launchDesktopWindow(existingUrl);
    return;
  }

  const srv = await bootServer(dataDir);
  logLine(`MOTIF server ready at ${srv.url} (data: ${dataDir})`);

  if (process.env.MOTIF_DRY_RUN === "1") {
    process.stdout.write(JSON.stringify({ ok: true, url: srv.url, dataDir, appDir: APP_DIR }) + "\n");
    await srv.close();
    return;
  }

  const shutdown = () => {
    srv
      .close()
      .catch(() => {})
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const { child, tracked } = launchDesktopWindow(srv.url);
  if (tracked && child) {
    child.on("exit", () => {
      logLine("MOTIF desktop window closed; stopping local server.");
      shutdown();
    });
    child.on("error", (err) => {
      logLine(`Desktop window process error: ${err?.message || err}`);
      shutdown();
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logLine(`Fatal startup error: ${err?.stack || err}`);
    process.stderr.write(`MOTIF startup error: ${err?.message || err}\n`);
    process.exit(1);
  });
}
