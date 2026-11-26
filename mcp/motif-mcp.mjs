#!/usr/bin/env node
/**
 * MOTIF Model Context Protocol (MCP) Stdio Server.
 *
 * Allows AI agents (Claude Desktop, Claude Code, Cursor, Codex, etc.) to inspect
 * and collaborate with MOTIF Brands, Video Projects, Footage, and Voice Notes
 * over standard JSON-RPC 2.0 stdio transport.
 */

import readline from "node:readline";
import { createMotifStore } from "../server/store.mjs";
import {
  MCP_SERVER_INFO,
  MCP_TOOLS,
  MCP_PROMPTS,
  listResources,
  readResource,
  getPrompt,
  executeTool,
} from "./tools.mjs";

const SUPPORTED_VERSIONS = ["2025-03-26", "2024-11-05"];
const store = createMotifStore();

let clientLabel = "MCP Agent";

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  send({ jsonrpc: "2.0", id, error: err });
}

/**
 * Notify a running MOTIF desktop/web server so live activity & SSE UI update immediately.
 */
async function notifyDesktopServer(eventType, detail, toolName = null) {
  try {
    const info = store.readServerInfo();
    const url = process.env.MOTIF_API_URL || info?.url;
    if (!url) return;
    await fetch(`${url.replace(/\/+$/, "")}/api/mcp/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: clientLabel,
        type: eventType,
        tool: toolName,
        detail,
      }),
      signal: AbortSignal.timeout(1200),
    }).catch(() => {});
  } catch {
    // desktop app may not be running; stdio MCP still works standalone directly on disk
  }
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;
  const hasId = id !== undefined && id !== null;

  try {
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        const protocolVersion = SUPPORTED_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_VERSIONS[0];
        if (params?.clientInfo?.name) {
          clientLabel = String(params.clientInfo.name).slice(0, 60);
        }
        store.recordActivity({
          source: "mcp",
          type: "mcp_connected",
          title: `${clientLabel} connected via MCP`,
          detail: `Protocol ${protocolVersion} · ${store.listBrands().length} brands visible`,
        });
        notifyDesktopServer("mcp_connected", `Protocol ${protocolVersion}`);
        if (hasId) {
          sendResult(id, {
            protocolVersion,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: MCP_SERVER_INFO,
            instructions: [
              "You are connected to MOTIF (Brand workspace + the video-edit agent stack).",
              "",
              "Brands & workspace: list_brands, get_brand_guidelines, list_projects, list_voice_notes, search_workspace.",
              "",
              "The video stack: MOTIF's local video agent runs on exactly one stack, published here. Read it before editing any clip —",
              "  • prompt video_agent → the stack brief (pipeline, clip state, brand, red lines)",
              "  • resource motif://video/stack → modes (quick/light/full), 17 stages with commands + validators, frames, styles, red lines",
              "  • resource motif://video/skill → the full SKILL.md instruction set the agent executes",
              "  • resource motif://video/projects → clip folders with their real on-disk artifacts",
              "  • tools video_edit_status / video_edit_plan / video_edit_stage / video_edit_run → readiness, ordered plan, one stage's commands+doc, and gated execution.",
              "Never render past a validator exit 3, and never write inside the skill folder.",
            ].join("\n"),
          });
        }
        return;
      }

      case "notifications/initialized":
      case "notifications/cancelled":
        return;

      case "ping": {
        if (hasId) sendResult(id, {});
        return;
      }

      case "tools/list": {
        if (hasId) sendResult(id, { tools: MCP_TOOLS });
        return;
      }

      case "tools/call": {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        if (!toolName || typeof toolName !== "string") {
          if (hasId) sendError(id, -32602, "Missing tool name");
          return;
        }
        try {
          const data = executeTool(store, toolName, toolArgs, { source: "mcp" });
          const isMutation = /^(create_|update_|delete_|add_)/.test(toolName);
          if (!isMutation) {
            store.recordActivity({
              source: "mcp",
              type: "mcp_tool",
              title: `${clientLabel} called ${toolName}`,
              detail: Object.keys(toolArgs).length ? JSON.stringify(toolArgs).slice(0, 140) : "Read workspace state",
              meta: { tool: toolName },
            });
          }
          notifyDesktopServer(isMutation ? "workspace_changed" : "mcp_tool", `${clientLabel} → ${toolName}`, toolName);
          if (hasId) {
            sendResult(id, {
              content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
              isError: false,
            });
          }
        } catch (err) {
          if (hasId) {
            sendResult(id, {
              content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
              isError: true,
            });
          }
        }
        return;
      }

      case "resources/list": {
        if (hasId) sendResult(id, { resources: listResources(store) });
        return;
      }

      case "resources/read": {
        const uri = params?.uri;
        if (!uri || typeof uri !== "string") {
          if (hasId) sendError(id, -32602, "Missing resource uri");
          return;
        }
        const content = readResource(store, uri);
        store.recordActivity({
          source: "mcp",
          type: "mcp_resource",
          title: `${clientLabel} read ${uri}`,
          detail: "MCP resource read",
        });
        notifyDesktopServer("mcp_resource", `${clientLabel} read ${uri}`);
        if (hasId) {
          sendResult(id, { contents: [content] });
        }
        return;
      }

      case "prompts/list": {
        if (hasId) sendResult(id, { prompts: MCP_PROMPTS });
        return;
      }

      case "prompts/get": {
        const promptName = params?.name;
        const promptArgs = params?.arguments || {};
        const prompt = getPrompt(store, promptName, promptArgs);
        if (hasId) sendResult(id, prompt);
        return;
      }

      default: {
        if (hasId) sendError(id, -32601, `Method not found: ${method}`);
      }
    }
  } catch (err) {
    if (hasId) {
      sendError(id, typeof err?.code === "number" ? err.code : -32603, err?.message || "Internal server error");
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    sendError(null, -32700, "Parse error");
    return;
  }
  handleMessage(parsed);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
