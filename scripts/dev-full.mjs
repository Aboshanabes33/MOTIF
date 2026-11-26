#!/usr/bin/env node
/**
 * Runs both the MOTIF local backend server and the Vite React dev server together.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const apiPort = process.env.MOTIF_PORT || "8795";
const env = {
  ...process.env,
  MOTIF_PORT: apiPort,
  MOTIF_HOST: "127.0.0.1",
  MOTIF_API_TARGET: `http://127.0.0.1:${apiPort}`,
};

const backend = spawn(process.execPath, [path.join(ROOT, "server", "motif-server.mjs")], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const frontend = spawn(process.execPath, [viteBin, "--host", "0.0.0.0", "--port", "5173"], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

function shutdown() {
  backend.kill("SIGTERM");
  frontend.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
backend.on("exit", (code) => {
  if (code) process.exit(code);
});
frontend.on("exit", (code) => {
  backend.kill("SIGTERM");
  process.exit(code ?? 0);
});
