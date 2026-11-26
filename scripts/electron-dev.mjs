#!/usr/bin/env node
/**
 * Starts the MOTIF backend, Vite React dev server, and Electron desktop window together.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const apiPort = process.env.MOTIF_PORT || "8795";
const devUrl = "http://127.0.0.1:5173";

const env = {
  ...process.env,
  MOTIF_PORT: apiPort,
  MOTIF_HOST: "127.0.0.1",
  MOTIF_API_TARGET: `http://127.0.0.1:${apiPort}`,
  MOTIF_DEV_URL: devUrl,
};

const backend = spawn(process.execPath, [path.join(ROOT, "server", "motif-server.mjs")], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "5173"], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

async function waitForUrl(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

const ready = await waitForUrl(devUrl);
if (!ready) {
  console.error("Timed out waiting for Vite dev server");
  backend.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exit(1);
}

const electronCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const electron = spawn(electronCmd, ["electron", "."], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

electron.on("exit", (code) => {
  backend.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exit(code ?? 0);
});
