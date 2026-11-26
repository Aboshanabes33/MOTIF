#!/usr/bin/env node
/**
 * MOTIF Local Backend Server (HTTP REST + SSE + Static React Bundle).
 *
 * Used by:
 * - Electron desktop app (embedded on loopback)
 * - Vite dev server proxy (/api/*)
 * - Standalone web preview / server mode
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMotifStore } from "./store.mjs";
import { fetchReleasesPayload } from "./releases.mjs";
import {
  MCP_SERVER_INFO,
  MCP_TOOLS,
  MCP_PROMPTS,
  listResources,
  readResource,
  executeTool,
} from "../mcp/tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".json": "application/json; charset=utf-8",
  ".webm": "audio/webm",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

function sendJson(res, status, data) {
  if (res.writableEnded) return;
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        reject(Object.assign(new Error("Request payload too large"), { status: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", (err) => {
      if (!failed) reject(err);
    });
  });
}

function buildMcpClientConfigs(mcpScriptPath, dataDir) {
  const normalizedScript = mcpScriptPath.replace(/\\/g, "/");
  const winScript = mcpScriptPath.replace(/\//g, "\\");
  const envBlock = { MOTIF_DATA: dataDir };

  return {
    scriptPath: mcpScriptPath,
    command: "node",
    args: [mcpScriptPath],
    claudeDesktop: {
      mcpServers: {
        motif: {
          command: "node",
          args: [winScript],
          env: envBlock,
        },
      },
    },
    claudeCode: {
      mcpServers: {
        motif: {
          command: "node",
          args: [normalizedScript],
          env: envBlock,
        },
      },
    },
    cursor: {
      mcpServers: {
        motif: {
          command: "node",
          args: [normalizedScript],
          env: envBlock,
        },
      },
    },
    codexToml: `[mcp_servers.motif]\ncommand = "node"\nargs = ["${normalizedScript}"]\n\n[mcp_servers.motif.env]\nMOTIF_DATA = "${dataDir.replace(/\\/g, "\\\\")}"`,
  };
}

export async function startMotifServer(opts = {}) {
  const host = opts.host || process.env.MOTIF_HOST || "127.0.0.1";
  const port = Number(opts.port ?? process.env.MOTIF_PORT ?? 8795);
  const staticDir = opts.staticDir || path.join(REPO_ROOT, "dist-web");
  const mcpScriptPath = opts.mcpScriptPath || path.join(REPO_ROOT, "mcp", "motif-mcp.mjs");
  const runtime = opts.runtime || (process.versions.electron ? "electron" : "web");

  const store = createMotifStore({
    dataDir: opts.dataDir,
    homeDir: opts.homeDir,
    projectsDir: opts.projectsDir,
    cleanInit: opts.cleanInit,
  });

  // SSE subscribers
  const sseClients = new Set();
  let lastMcpPing = null;
  let mcpClientCount = 0;

  function broadcast(eventName, payload = {}) {
    const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(msg);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  // Watch prefs.json for external MCP / legacy edits so UI always stays live
  let prefsWatchTimer = null;
  let watcher = null;
  try {
    watcher = fs.watch(store.paths.homeDir, (_eventType, filename) => {
      if (!filename) return;
      if (filename === "prefs.json" || filename === "workspace.json" || filename === "activity.json") {
        clearTimeout(prefsWatchTimer);
        prefsWatchTimer = setTimeout(() => {
          broadcast("workspace", { reason: filename, at: Date.now() });
        }, 120);
      }
    });
    watcher.unref?.();
  } catch {
    // ignore fs.watch unavailability
  }

  const releaseDir = opts.releaseDir || path.join(REPO_ROOT, "release");

  function serveDownloadFile(req, res, pathname) {
    const match = /^\/downloads\/([^/]+)$/.exec(pathname);
    if (!match) return false;
    const rawName = match[1];
    if (!rawName || path.basename(rawName) !== rawName) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    if (!/^[A-Za-z0-9._-]+(\.exe|\.txt|\.zip|\.msi)$/i.test(rawName)) {
      sendJson(res, 404, { error: "Download artifact not found" });
      return true;
    }
    const target = path.resolve(releaseDir, rawName);
    if (!target.startsWith(path.resolve(releaseDir) + path.sep) || !fs.existsSync(target)) {
      sendJson(res, 404, { error: "Download artifact not found" });
      return true;
    }
    const stat = fs.statSync(target);
    if (!stat.isFile()) {
      sendJson(res, 404, { error: "Download artifact not found" });
      return true;
    }
    const ext = path.extname(rawName).toLowerCase();
    const contentType =
      ext === ".exe"
        ? "application/vnd.microsoft.portable-executable"
        : ext === ".txt"
          ? "text/plain; charset=utf-8"
          : "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": stat.size,
      "content-disposition": `attachment; filename="${rawName}"`,
      "cache-control": "no-cache",
    });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    fs.createReadStream(target).pipe(res);
    return true;
  }

  function serveStaticFile(req, res, pathname) {
    if (!fs.existsSync(staticDir)) return false;
    const cleanPath = pathname === "/" ? "/index.html" : pathname;
    const candidate = path.resolve(staticDir, `.${cleanPath}`);
    if (!candidate.startsWith(path.resolve(staticDir))) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    let filePath = candidate;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA fallback for /releases or any client route
      if (!path.extname(cleanPath) || cleanPath === "/releases") {
        filePath = path.join(staticDir, "index.html");
      } else {
        return false;
      }
    }
    if (!fs.existsSync(filePath)) return false;

    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": stat.size,
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(urlObj.pathname);
    const method = (req.method || "GET").toUpperCase();

    try {
      // --- Health & Info ---
      if (method === "GET" && pathname === "/api/health") {
        return sendJson(res, 200, { ok: true, app: "MOTIF", version: MCP_SERVER_INFO.version });
      }

      if (method === "GET" && pathname === "/api/info") {
        return sendJson(res, 200, {
          app: "MOTIF",
          version: MCP_SERVER_INFO.version,
          runtime,
          platform: process.platform,
          arch: process.arch,
          dataDir: store.paths.dataDir,
          prefsFile: store.paths.prefsFile,
          projectsDir: store.paths.projectsDir,
          mcp: {
            ready: true,
            serverName: MCP_SERVER_INFO.name,
            version: MCP_SERVER_INFO.version,
            toolCount: MCP_TOOLS.length,
            resourceCount: listResources(store).length,
            promptCount: MCP_PROMPTS.length,
            lastEventAt: lastMcpPing,
            connectedClients: mcpClientCount,
          },
        });
      }

      // --- SSE Stream ---
      if (method === "GET" && pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        res.write(`event: hello\ndata: ${JSON.stringify({ app: "MOTIF", at: Date.now() })}\n\n`);
        sseClients.add(res);
        const keepAlive = setInterval(() => {
          try {
            res.write(": ping\n\n");
          } catch {
            clearInterval(keepAlive);
            sseClients.delete(res);
          }
        }, 20_000);
        req.on("close", () => {
          clearInterval(keepAlive);
          sseClients.delete(res);
        });
        return;
      }

      // --- Workspace Snapshot (single round-trip hydration) ---
      if (method === "GET" && pathname === "/api/workspace") {
        const prefs = store.readPrefs();
        return sendJson(res, 200, {
          prefs,
          brands: prefs.brands,
          projects: store.listProjects(),
          footage: store.listFootage(),
          voiceNotes: store.listVoiceNotes(),
          activity: store.listActivity(30),
        });
      }

      // --- Preferences (canonical prefs.json contract per AGENT.md / CLAUDE.md) ---
      if (method === "GET" && pathname === "/api/prefs") {
        return sendJson(res, 200, store.readPrefs());
      }

      if (method === "PUT" && pathname === "/api/prefs") {
        const body = await readJsonBody(req);
        const updated = store.writePrefs(body);
        broadcast("prefs", { brandsCount: updated.brands.length, at: Date.now() });
        return sendJson(res, 200, updated);
      }

      // --- Brands REST (backed by prefs.json) ---
      if (method === "GET" && pathname === "/api/brands") {
        return sendJson(res, 200, { brands: store.listBrands() });
      }

      if (method === "POST" && pathname === "/api/brands") {
        const body = await readJsonBody(req);
        const brand = store.createBrand(body, { source: "user" });
        broadcast("prefs", { action: "brand_created", brandId: brand.id });
        return sendJson(res, 201, { brand, brands: store.listBrands() });
      }

      const brandMatch = /^\/api\/brands\/([^/]+)$/.exec(pathname);
      if (brandMatch) {
        const brandId = decodeURIComponent(brandMatch[1]);
        if (method === "GET") {
          const brand = store.getBrand(brandId);
          if (!brand) return sendJson(res, 404, { error: "Brand not found" });
          return sendJson(res, 200, { brand });
        }
        if (method === "PUT" || method === "PATCH") {
          const body = await readJsonBody(req);
          const brand = store.updateBrand(brandId, body, { source: "user" });
          broadcast("prefs", { action: "brand_updated", brandId: brand.id });
          return sendJson(res, 200, { brand, brands: store.listBrands() });
        }
        if (method === "DELETE") {
          const result = store.deleteBrand(brandId, { source: "user" });
          broadcast("prefs", { action: "brand_deleted", brandId });
          return sendJson(res, 200, { ...result, brands: store.listBrands() });
        }
      }

      // --- Projects ---
      if (method === "GET" && pathname === "/api/projects") {
        const projects = store.listProjects({
          brandId: urlObj.searchParams.get("brandId") || undefined,
          status: urlObj.searchParams.get("status") || undefined,
          query: urlObj.searchParams.get("q") || undefined,
        });
        return sendJson(res, 200, { projects });
      }

      if (method === "POST" && pathname === "/api/projects") {
        const body = await readJsonBody(req);
        const project = store.createProject(body, { source: "user" });
        broadcast("projects", { action: "created", projectId: project.id });
        return sendJson(res, 201, { project });
      }

      const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(pathname);
      if (projectMatch) {
        const projectId = decodeURIComponent(projectMatch[1]);
        if (method === "GET") {
          const project = store.getProject(projectId);
          if (!project) return sendJson(res, 404, { error: "Project not found" });
          return sendJson(res, 200, { project });
        }
        if (method === "PATCH" || method === "PUT") {
          const body = await readJsonBody(req);
          const project = store.updateProject(projectId, body, { source: "user" });
          broadcast("projects", { action: "updated", projectId: project.id });
          return sendJson(res, 200, { project });
        }
        if (method === "DELETE") {
          const result = store.deleteProject(projectId, { source: "user" });
          broadcast("projects", { action: "deleted", projectId });
          return sendJson(res, 200, result);
        }
      }

      // --- Footage ---
      if (method === "GET" && pathname === "/api/footage") {
        return sendJson(res, 200, {
          footage: store.listFootage({
            brandId: urlObj.searchParams.get("brandId") || undefined,
            projectId: urlObj.searchParams.get("projectId") || undefined,
          }),
        });
      }

      if (method === "POST" && pathname === "/api/footage") {
        const body = await readJsonBody(req);
        const item = store.addFootage(body, { source: "user" });
        broadcast("workspace", { action: "footage_added", id: item.id });
        return sendJson(res, 201, { footage: item });
      }

      const footageMatch = /^\/api\/footage\/([^/]+)$/.exec(pathname);
      if (footageMatch && method === "DELETE") {
        const result = store.deleteFootage(decodeURIComponent(footageMatch[1]), { source: "user" });
        broadcast("workspace", { action: "footage_deleted" });
        return sendJson(res, 200, result);
      }

      // --- Voice Notes ---
      if (method === "GET" && pathname === "/api/voice-notes") {
        return sendJson(res, 200, {
          voiceNotes: store.listVoiceNotes({
            brandId: urlObj.searchParams.get("brandId") || undefined,
            projectId: urlObj.searchParams.get("projectId") || undefined,
          }),
        });
      }

      if (method === "POST" && pathname === "/api/voice-notes") {
        const body = await readJsonBody(req, 32 * 1024 * 1024);
        const voiceNote = store.createVoiceNote(body, { source: "user" });
        broadcast("workspace", { action: "voice_note_created", id: voiceNote.id });
        return sendJson(res, 201, { voiceNote });
      }

      const vnAudioMatch = /^\/api\/voice-notes\/([^/]+)\/audio$/.exec(pathname);
      if (vnAudioMatch && method === "GET") {
        const audio = store.getVoiceNoteAudioPath(decodeURIComponent(vnAudioMatch[1]));
        if (!audio) return sendJson(res, 404, { error: "Audio not found" });
        const stat = fs.statSync(audio.filePath);
        res.writeHead(200, {
          "content-type": audio.mimeType,
          "content-length": stat.size,
          "accept-ranges": "bytes",
        });
        fs.createReadStream(audio.filePath).pipe(res);
        return;
      }

      const vnMatch = /^\/api\/voice-notes\/([^/]+)$/.exec(pathname);
      if (vnMatch && method === "DELETE") {
        const result = store.deleteVoiceNote(decodeURIComponent(vnMatch[1]), { source: "user" });
        broadcast("workspace", { action: "voice_note_deleted" });
        return sendJson(res, 200, result);
      }

      // --- Search ---
      if (method === "GET" && pathname === "/api/search") {
        const q = urlObj.searchParams.get("q") || "";
        return sendJson(res, 200, store.searchWorkspace(q));
      }

      // --- Activity ---
      if (method === "GET" && pathname === "/api/activity") {
        return sendJson(res, 200, { events: store.listActivity(40) });
      }

      // --- MCP Hub API ---
      if (method === "GET" && pathname === "/api/mcp/status") {
        return sendJson(res, 200, {
          server: MCP_SERVER_INFO,
          protocolVersion: "2025-03-26",
          transport: "stdio (JSON-RPC 2.0)",
          lastEventAt: lastMcpPing,
          connectedClients: mcpClientCount,
          tools: MCP_TOOLS,
          resources: listResources(store),
          prompts: MCP_PROMPTS,
          configs: buildMcpClientConfigs(mcpScriptPath, store.paths.dataDir),
        });
      }

      if (method === "POST" && pathname === "/api/mcp/invoke") {
        const body = await readJsonBody(req);
        const tool = String(body.tool || "");
        const args = body.arguments && typeof body.arguments === "object" ? body.arguments : {};
        const started = Date.now();
        const result = executeTool(store, tool, args, { source: "mcp" });
        const elapsedMs = Date.now() - started;
        lastMcpPing = new Date().toISOString();
        if (!/^(create_|update_|delete_|add_)/.test(tool)) {
          store.recordActivity({
            source: "mcp",
            type: "mcp_tool",
            title: `MCP Inspector called ${tool}`,
            detail: `${elapsedMs} ms`,
            meta: { tool },
          });
        }
        broadcast("mcp", { tool, elapsedMs, at: Date.now() });
        broadcast("workspace", { reason: `mcp:${tool}`, at: Date.now() });
        return sendJson(res, 200, {
          ok: true,
          tool,
          elapsedMs,
          result,
        });
      }

      if (method === "GET" && pathname === "/api/mcp/resource") {
        const uri = urlObj.searchParams.get("uri") || "";
        const content = readResource(store, uri);
        return sendJson(res, 200, { ok: true, content });
      }

      if (method === "POST" && pathname === "/api/mcp/event") {
        const body = await readJsonBody(req);
        lastMcpPing = new Date().toISOString();
        if (body.type === "mcp_connected") mcpClientCount += 1;
        broadcast("mcp", {
          client: body.client || "MCP Agent",
          type: body.type || "mcp_tool",
          tool: body.tool || null,
          detail: body.detail || "",
          at: Date.now(),
        });
        broadcast("workspace", { reason: "mcp_external", at: Date.now() });
        return sendJson(res, 200, { ok: true });
      }

      // --- Releases Page API ---
      if (method === "GET" && pathname === "/api/releases") {
        const payload = await fetchReleasesPayload({ releaseDir });
        return sendJson(res, 200, payload);
      }

      // --- Built Windows release downloads (/downloads/*.exe, SHA256SUMS.txt) ---
      if ((method === "GET" || method === "HEAD") && pathname.startsWith("/downloads/")) {
        if (serveDownloadFile(req, res, pathname)) return;
      }

      // --- Static built React app ---
      if ((method === "GET" || method === "HEAD") && !pathname.startsWith("/api/")) {
        if (serveStaticFile(req, res, pathname)) return;
      }

      return sendJson(res, 404, { error: "Not found", path: pathname });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      return sendJson(res, status, {
        error: err?.message || "Internal server error",
        code: err?.code || undefined,
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  const localUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${actualPort}`;

  store.writeServerInfo({
    url: localUrl,
    port: actualPort,
    host,
    runtime,
    version: MCP_SERVER_INFO.version,
  });

  const close = () =>
    new Promise((resolve) => {
      clearTimeout(prefsWatchTimer);
      if (watcher) {
        try {
          watcher.close();
        } catch {
          // ignore
        }
        watcher = null;
      }
      for (const client of sseClients) {
        try {
          client.end();
        } catch {
          // ignore
        }
      }
      sseClients.clear();
      server.close(() => resolve());
      server.closeAllConnections?.();
    });

  return {
    server,
    store,
    host,
    port: actualPort,
    url: localUrl,
    close,
  };
}

// Run directly as CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMotifServer()
    .then((srv) => {
      process.stdout.write(`MOTIF backend listening on ${srv.url} (data: ${srv.store.paths.dataDir})\n`);
      const shutdown = () => {
        srv.close().finally(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      process.stderr.write(`Failed to start MOTIF backend: ${err?.stack || err}\n`);
      process.exit(1);
    });
}
