import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMotifServer } from "../server/motif-server.mjs";
import { createMotifStore } from "../server/store.mjs";
import {
  clientDefs,
  detectClients,
  installClient,
  removeClient,
  verifyMcpServer,
} from "../server/mcp-install.mjs";
import { MCP_TOOLS, MCP_PROMPTS, executeTool, readResource, getPrompt, listResources } from "../mcp/tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MCP_SCRIPT = path.join(REPO_ROOT, "mcp", "motif-mcp.mjs");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "motif-mcp-home-"));
}

test("one-click install writes MOTIF into each agent's own config without touching other servers", () => {
  const home = tmpHome();
  const opts = { home, platform: "linux", env: {} };
  const dataDir = path.join(home, ".motif", "workspace");

  // An existing Cursor config with another server must survive.
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2),
  );

  const cursored = installClient({ ...opts, client: "cursor", mcpScriptPath: MCP_SCRIPT, dataDir });
  assert.equal(cursored.ok, true);
  assert.equal(cursored.label, "Cursor");
  assert.ok(cursored.backup, "an existing config gets a timestamped backup");
  const cfg = JSON.parse(fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8"));
  assert.deepEqual(cfg.mcpServers.other, { command: "x" });
  assert.equal(cfg.mcpServers.motif.args[0], MCP_SCRIPT);
  assert.equal(cfg.mcpServers.motif.env.MOTIF_DATA, dataDir);

  // Installing again is idempotent and reported as already connected.
  const again = installClient({ ...opts, client: "cursor", mcpScriptPath: MCP_SCRIPT, dataDir });
  assert.equal(again.alreadyConnected, true);

  // Codex uses TOML and keeps its other tables.
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex", "config.toml"), 'model = "gpt-5-codex"\n');
  installClient({ ...opts, client: "codex", mcpScriptPath: MCP_SCRIPT, dataDir });
  const toml = fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
  assert.match(toml, /model = "gpt-5-codex"/);
  assert.match(toml, /\[mcp_servers\.motif\]/);
  assert.match(toml, /args = \["/);

  // Remove only strips MOTIF.
  const removed = removeClient({ ...opts, client: "cursor" });
  assert.equal(removed.removed, true);
  const after = JSON.parse(fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8"));
  assert.deepEqual(after.mcpServers.other, { command: "x" });
  assert.equal(after.mcpServers.motif, undefined);

  const removedToml = removeClient({ ...opts, client: "codex" });
  assert.equal(removedToml.removed, true);
  const tomlAfter = fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
  assert.doesNotMatch(tomlAfter, /mcp_servers\.motif/);
  assert.match(tomlAfter, /model = "gpt-5-codex"/);

  fs.rmSync(home, { recursive: true, force: true });
});

test("install refuses to clobber an invalid config and detect reports state per agent", () => {
  const home = tmpHome();
  const opts = { home, platform: "linux", env: {} };
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cursor", "mcp.json"), "{ not json");

  assert.throws(
    () => installClient({ ...opts, client: "cursor", mcpScriptPath: MCP_SCRIPT }),
    (err) => err.code === "INVALID_CONFIG" && err.status === 422,
  );
  assert.equal(fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8"), "{ not json");

  const detected = detectClients({ ...opts, mcpScriptPath: MCP_SCRIPT });
  assert.deepEqual(
    detected.map((d) => d.id),
    ["claude-desktop", "claude-code", "cursor", "windsurf", "vscode", "codex"],
  );
  assert.equal(detected.find((d) => d.id === "cursor").configured, false);

  assert.throws(() => installClient({ ...opts, client: "nope", mcpScriptPath: MCP_SCRIPT }), /Unknown MCP client/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("agent config paths follow each OS convention", () => {
  const win = clientDefs({ platform: "win32", home: "C:\\Users\\Me", env: { APPDATA: "C:\\Users\\Me\\AppData\\Roaming" } });
  const get = (id) => win.find((d) => d.id === id).configPath;
  assert.equal(get("claude-desktop"), "C:\\Users\\Me\\AppData\\Roaming\\Claude\\claude_desktop_config.json");
  assert.equal(get("cursor"), "C:\\Users\\Me\\.cursor\\mcp.json");
  assert.equal(get("codex"), "C:\\Users\\Me\\.codex\\config.toml");
  assert.equal(get("vscode"), "C:\\Users\\Me\\AppData\\Roaming\\Code\\User\\mcp.json");

  const mac = clientDefs({ platform: "darwin", home: "/Users/me", env: {} });
  assert.equal(
    mac.find((d) => d.id === "claude-desktop").configPath,
    "/Users/me/Library/Application Support/Claude/claude_desktop_config.json",
  );
  assert.equal(mac.find((d) => d.id === "cursor").kind, "json");
  assert.equal(mac.find((d) => d.id === "codex").kind, "toml");
});

test("the stack itself is served over MCP: manifest, SKILL.md, every doc, and a brief prompt", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "motif-stack-mcp-"));
  const store = createMotifStore({ dataDir, cleanInit: true });
  try {
    const names = MCP_TOOLS.map((t) => t.name);
    assert.ok(names.includes("video_stack"));
    assert.ok(names.includes("video_stack_doc"));
    assert.ok(MCP_PROMPTS.some((p) => p.name === "video_stack_brief"));

    const stack = executeTool(store, "video_stack", {});
    assert.equal(stack.stack.name, "video-edit");
    assert.ok(stack.stack.stages.length >= 16);
    assert.match(stack.entrypoint.text, /stack/i);
    assert.ok(stack.docs.length >= 9, "manifest references + styles are indexed");
    assert.ok(stack.docs.every((d) => d.chars > 0));

    const rules = executeTool(store, "video_stack_doc", { doc: "rules" });
    assert.match(rules.text, /./);
    assert.equal(rules.doc.kind, "reference");

    const skill = executeTool(store, "video_stack_doc", { doc: "SKILL.md" });
    assert.equal(skill.doc.kind, "skill");
    assert.ok(skill.text.includes("stack.json"));

    const uris = listResources(store).map((r) => r.uri);
    for (const uri of ["motif://video/skill", "motif://video/bundle", "motif://video/docs/rules", "motif://video/docs/simple"]) {
      assert.ok(uris.includes(uri), `missing resource ${uri}`);
    }
    const skillRes = readResource(store, "motif://video/skill");
    assert.equal(skillRes.mimeType, "text/markdown");
    assert.ok(skillRes.text.length > 1000);
    const bundle = JSON.parse(readResource(store, "motif://video/bundle").text);
    assert.equal(bundle.stack.name, "video-edit");
    assert.ok(bundle.docs.length >= 9);

    const brief = getPrompt(store, "video_stack_brief", { mode: "quick" });
    const text = brief.messages[0].content.text;
    assert.match(text, /quick/);
    assert.match(text, /Red lines/);
    assert.match(text, /video_stack_doc/);

    // Unknown docs are refused, not guessed.
    assert.throws(() => executeTool(store, "video_stack_doc", { doc: "../../etc/passwd" }), /Unknown stack doc/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("verify boots the stdio server the way an agent will and confirms the stack is exposed", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "motif-verify-"));
  const result = await verifyMcpServer({ mcpScriptPath: MCP_SCRIPT, dataDir });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.serverInfo.name, "motif");
  assert.ok(result.toolCount >= 22);
  assert.equal(result.hasStack, true);

  const missing = await verifyMcpServer({ mcpScriptPath: path.join(dataDir, "nope.mjs") });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not found/);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("HTTP /api/mcp/install|uninstall|prompt drive the one-click connect flow", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "motif-mcp-api-"));
  const srv = await startMotifServer({ host: "127.0.0.1", port: 0, dataDir: tmpDir, cleanInit: true });
  try {
    const status = await fetch(`${srv.url}/api/mcp/status`).then((r) => r.json());
    assert.ok(Array.isArray(status.clients));
    assert.ok(status.clients.some((c) => c.id === "claude-desktop"));
    assert.ok(status.resources.some((r) => r.uri === "motif://video/skill"));

    const install = await fetch(`${srv.url}/api/mcp/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client: "claude-desktop" }),
    }).then((r) => r.json());
    assert.equal(install.ok, true);
    assert.equal(install.label, "Claude Desktop");
    assert.equal(install.verify.ok, true, install.verify?.error);
    assert.equal(install.verify.hasStack, true);
    assert.ok(install.clients.find((c) => c.id === "claude-desktop").configured);
    const written = JSON.parse(fs.readFileSync(install.configPath, "utf8"));
    assert.ok(written.mcpServers.motif);

    const prompt = await fetch(`${srv.url}/api/mcp/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "video_stack_brief", arguments: { mode: "light" } }),
    }).then((r) => r.json());
    assert.match(prompt.messages[0].content.text, /light/);

    const uninstall = await fetch(`${srv.url}/api/mcp/uninstall`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client: "claude-desktop" }),
    }).then((r) => r.json());
    assert.equal(uninstall.removed, true);
    assert.equal(uninstall.clients.find((c) => c.id === "claude-desktop").configured, false);

    const bad = await fetch(`${srv.url}/api/mcp/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client: "not-an-agent" }),
    });
    assert.equal(bad.status, 400);
  } finally {
    await srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
