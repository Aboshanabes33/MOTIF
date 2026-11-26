import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MCP_BIN = path.join(REPO_ROOT, "mcp", "motif-mcp.mjs");

function createMcpClient(dataDir) {
  const proc = spawn(process.execPath, [MCP_BIN], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      MOTIF_DATA: dataDir,
      MOTIF_CLEAN_INIT: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map();
  let nextId = 1;

  const rl = readline.createInterface({ input: proc.stdout });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  });

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP timeout waiting for ${method}`));
      }, 6000);
      pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
      proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  function notify(method, params = {}) {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  function close() {
    rl.close();
    proc.kill("SIGTERM");
  }

  return { request, notify, close };
}

test("MOTIF MCP stdio server: initialize, tools, brands CRUD, resources, prompts, prefs.json persistence", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "motif-mcp-test-"));
  const client = createMcpClient(tmpDir);

  try {
    // 1. Initialize handshake
    const init = await client.request("initialize", {
      protocolVersion: "2025-03-26",
      clientInfo: { name: "TestAgent", version: "1.0.0" },
    });
    assert.equal(init.result.serverInfo.name, "motif");
    assert.equal(init.result.protocolVersion, "2025-03-26");
    client.notify("notifications/initialized");

    // 2. Ping
    const ping = await client.request("ping");
    assert.deepEqual(ping.result, {});

    // 3. List tools
    const toolsResp = await client.request("tools/list");
    const toolNames = toolsResp.result.tools.map((t) => t.name);
    for (const expected of [
      "motif_status",
      "list_brands",
      "get_brand",
      "get_brand_guidelines",
      "create_brand",
      "update_brand",
      "delete_brand",
      "list_projects",
      "create_project",
      "list_voice_notes",
      "search_workspace",
    ]) {
      assert.ok(toolNames.includes(expected), `Missing MCP tool ${expected}`);
    }

    // 4. Create Brand via MCP tool
    const createRes = await client.request("tools/call", {
      name: "create_brand",
      arguments: {
        name: "Noor Roastery · محمصة نور",
        tagline: "Single-origin specialty coffee",
        colors: ["#b5673b", "#e8c8a0", "#2d241e"],
        audience: "Specialty coffee lovers",
        voice: "Warm, sensory, unhurried",
        channels: "Instagram Reels, TikTok",
        notes: "Use warm copper accents",
      },
    });
    assert.equal(createRes.result.isError, false);
    const createdPayload = JSON.parse(createRes.result.content[0].text);
    assert.equal(createdPayload.ok, true);
    const brandId = createdPayload.brand.id;
    assert.ok(brandId);

    // 5. List brands & verify AI agent sees it
    const listRes = await client.request("tools/call", {
      name: "list_brands",
      arguments: {},
    });
    const listPayload = JSON.parse(listRes.result.content[0].text);
    assert.equal(listPayload.count, 1);
    assert.equal(listPayload.brands[0].name, "Noor Roastery · محمصة نور");

    // 6. Get brand guidelines by Arabic substring
    const guideRes = await client.request("tools/call", {
      name: "get_brand_guidelines",
      arguments: { brand: "محمصة نور" },
    });
    const guidePayload = JSON.parse(guideRes.result.content[0].text);
    assert.equal(guidePayload.found, true);
    assert.match(guidePayload.summary, /#b5673b/);
    assert.match(guidePayload.summary, /Warm, sensory/);

    // 7. Create a project linked to that brand via MCP
    const projRes = await client.request("tools/call", {
      name: "create_project",
      arguments: {
        name: "Guji Pour-Over Reel",
        brandId,
        aspect: "9:16",
      },
    });
    const projPayload = JSON.parse(projRes.result.content[0].text);
    assert.equal(projPayload.ok, true);
    assert.equal(projPayload.project.brandId, brandId);

    // 8. Read MCP resource motif://brands/{id}
    const resourcesResp = await client.request("resources/list");
    assert.ok(resourcesResp.result.resources.some((r) => r.uri === `motif://brands/${brandId}`));

    const readRes = await client.request("resources/read", { uri: `motif://brands/${brandId}` });
    const parsedResource = JSON.parse(readRes.result.contents[0].text);
    assert.equal(parsedResource.brand.id, brandId);
    assert.equal(parsedResource.relatedCounts.projects, 1);

    // 9. Get MCP prompt brand_brief
    const promptRes = await client.request("prompts/get", {
      name: "brand_brief",
      arguments: { brand: brandId, topic: "Ramadan Cold Brew Campaign" },
    });
    assert.match(promptRes.result.messages[0].content.text, /Ramadan Cold Brew Campaign/);
    assert.match(promptRes.result.messages[0].content.text, /Noor Roastery/);

    // 10. Verify prefs.json on disk contains the MCP-created brand
    const diskPrefs = JSON.parse(fs.readFileSync(path.join(tmpDir, "home", "prefs.json"), "utf8"));
    assert.equal(diskPrefs.brands.length, 1);
    assert.equal(diskPrefs.brands[0].id, brandId);

    // 11. Delete brand via MCP
    const delRes = await client.request("tools/call", {
      name: "delete_brand",
      arguments: { id: brandId },
    });
    const delPayload = JSON.parse(delRes.result.content[0].text);
    assert.equal(delPayload.ok, true);
  } finally {
    client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
