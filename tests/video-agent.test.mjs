import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMotifServer } from "../server/motif-server.mjs";
import { createMotifStore } from "../server/store.mjs";
import { executeTool, MCP_TOOLS, MCP_PROMPTS, readResource, getPrompt } from "../mcp/tools.mjs";
import {
  editingHome,
  editingStatus,
  clipPlan,
  stagePlan,
  readStack,
  safeClipName,
  writeClipMode,
} from "../server/video-agent.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SKILL_DIR = path.join(REPO_ROOT, "video-edit");

test("video-edit stack manifest is complete and every referenced file exists", () => {
  const stack = readStack();
  assert.equal(stack.name, "video-edit");
  assert.equal(stack.entrypoint, "SKILL.md");
  assert.ok(fs.existsSync(path.join(SKILL_DIR, stack.entrypoint)), "SKILL.md missing");

  const stageIds = new Set(stack.stages.map((s) => s.id));
  assert.ok(stageIds.size >= 16, "expected at least 16 pipeline stages");
  for (const [mode, def] of Object.entries(stack.modes)) {
    assert.ok(def.stages.length > 0, `mode ${mode} has no stages`);
    for (const id of def.stages) assert.ok(stageIds.has(id), `mode ${mode} references unknown stage ${id}`);
  }

  for (const ref of stack.references) {
    assert.ok(fs.existsSync(path.join(SKILL_DIR, ref.path)), `reference missing: ${ref.path}`);
    assert.ok(ref.ar && ref.en, `reference ${ref.id} must be bilingual`);
  }
  for (const style of stack.styles) {
    assert.ok(fs.existsSync(path.join(SKILL_DIR, style.doc)), `style doc missing: ${style.doc}`);
  }
  assert.ok(stack.redLines.length >= 6, "red lines must be published in the manifest");
  for (const stage of stack.stages) {
    assert.ok(stage.title.ar && stage.title.en, `stage ${stage.id} needs bilingual titles`);
    assert.ok(fs.existsSync(path.join(SKILL_DIR, stage.doc)), `stage ${stage.id} doc missing: ${stage.doc}`);
  }
});

test("editing home follows the skill rule (VEB_HOME wins, non-ASCII/OneDrive falls back)", () => {
  assert.equal(editingHome({ VEB_HOME: "/tmp/veb" }, "darwin", "/Users/me"), "/tmp/veb");
  assert.equal(editingHome({}, "darwin", "/Users/me"), "/Users/me/Documents/video-edit");
  assert.equal(editingHome({}, "linux", "/home/me"), "/home/me/Documents/video-edit");
  assert.equal(
    editingHome({}, "win32", "C:\\Users\\Me"),
    "C:\\Users\\Me\\Documents\\video-edit",
  );
  assert.equal(editingHome({}, "win32", "C:\\Users\\مستخدم"), "C:\\EditStudio");
  assert.equal(
    editingHome({ OneDrive: "C:\\Users\\Me\\OneDrive" }, "win32", "C:\\Users\\Me", (p) => p.endsWith("OneDrive\\Documents")),
    "C:\\EditStudio",
  );
});

test("safeClipName strips the characters Windows refuses", () => {
  assert.equal(safeClipName('AI: المستقبل؟'), "AI- المستقبل؟");
  assert.equal(safeClipName("clip / 1 <test>"), "clip - 1 -test-");
  assert.equal(safeClipName("trailing. "), "trailing");
});

test("clip plan + stage plan produce runnable commands with the real folder", () => {
  const plan = clipPlan({ name: "Demo Clip", mode: "quick" });
  assert.equal(plan.name, "Demo Clip");
  assert.ok(plan.work.endsWith(path.join("projects", "Demo Clip")));
  const ids = plan.steps.map((s) => s.id);
  assert.ok(!ids.includes("scenes"), "quick mode must skip scenes");
  const cut = stagePlan({ stageId: "cut", mode: "quick", work: plan.work, name: plan.name });
  assert.equal(cut.commands[0], `python3 scripts/01_cut_plan.py "${plan.work}"`);
  const captions = stagePlan({ stageId: "captions", mode: "quick", work: plan.work });
  assert.ok(captions.commands[0].includes("02_captions.py"));
  assert.throws(() => stagePlan({ stageId: "nope", work: plan.work }), /Unknown stage/);
  assert.throws(() => clipPlan({ name: "x", mode: "cinema" }), /Unknown mode/);
});

test("MCP surface exposes the video-edit stack: tools, resources, prompt", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "motif-video-"));
  const store = createMotifStore({ dataDir, cleanInit: true });
  try {
    const names = MCP_TOOLS.map((t) => t.name);
    for (const expected of ["video_edit_status", "video_edit_plan", "video_edit_stage", "video_edit_run"]) {
      assert.ok(names.includes(expected), `missing MCP tool ${expected}`);
    }
    assert.ok(MCP_PROMPTS.some((p) => p.name === "video_agent"), "video_agent prompt missing");

    const status = executeTool(store, "video_edit_status", {});
    assert.equal(status.stack.name, "video-edit");
    assert.ok(Array.isArray(status.projects));
    assert.ok(status.stageCount >= 16);

    const plan = executeTool(store, "video_edit_plan", { name: "MCP Clip", mode: "light" });
    assert.equal(plan.ok, true);
    assert.ok(plan.steps.some((s) => s.id === "sfx"), "light mode must include sfx");
    assert.match(plan.brief, /red lines/i);

    const stage = executeTool(store, "video_edit_stage", { stage: "render", work: plan.work, name: plan.name, mode: "light" });
    assert.ok(stage.commands.some((c) => c.includes("04b_remotion.sh")));
    assert.ok(stage.checks.some((c) => c.includes("22_preflight.py")));

    const stackRes = readResource(store, "motif://video/stack");
    assert.equal(JSON.parse(stackRes.text).stack.name, "video-edit");
    const projectsRes = readResource(store, "motif://video/projects");
    assert.ok(Array.isArray(JSON.parse(projectsRes.text).projects));

    const prompt = getPrompt(store, "video_agent", {});
    assert.match(prompt.messages[0].content.text, /video-edit/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("HTTP /api/video/edit/* serves status, stack, plan, stage, mode and refuses unsafe runs", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "motif-video-api-"));
  const home = path.join(tmpDir, "video-home");
  fs.mkdirSync(home, { recursive: true });
  const prevVeb = process.env.VEB_HOME;
  process.env.VEB_HOME = home;
  const srv = await startMotifServer({ host: "127.0.0.1", port: 0, dataDir: tmpDir, cleanInit: true });
  try {
    const base = srv.url;
    const status = await fetch(`${base}/api/video/edit/status`).then((r) => r.json());
    assert.equal(status.stack.name, "video-edit");
    assert.equal(status.home, home);

    const stack = await fetch(`${base}/api/video/edit/stack`).then((r) => r.json());
    assert.ok(stack.stack.stages.length >= 16);
    assert.match(stack.brief, /MOTIF Video Agent/);

    const plan = await fetch(`${base}/api/video/edit/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "API Clip", mode: "full" }),
    }).then((r) => r.json());
    assert.equal(plan.ok, true);
    assert.ok(plan.steps.some((s) => s.id === "scenes"));

    const stage = await fetch(`${base}/api/video/edit/stage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "verify", work: plan.work, name: plan.name }),
    }).then((r) => r.json());
    assert.ok(stage.checks.length > 0 || stage.commands.length > 0);

    // mode.json is a real contract the skill's validators read
    fs.mkdirSync(plan.work, { recursive: true });
    const mode = await fetch(`${base}/api/video/edit/mode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ work: plan.work, mode: "quick" }),
    }).then((r) => r.json());
    assert.equal(mode.ok, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(plan.work, "mode.json"), "utf8")).mode, "quick");

    // the run endpoint only executes whitelisted skill scripts; others are refused
    const refused = await fetch(`${base}/api/video/edit/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "setup", work: plan.work, name: plan.name }),
    });
    assert.ok([400, 500].includes(refused.status), `expected a refusal, got ${refused.status}`);

    const badPlan = await fetch(`${base}/api/video/edit/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "", mode: "full" }),
    });
    assert.equal(badPlan.status, 400);
  } finally {
    await srv.close();
    if (prevVeb === undefined) delete process.env.VEB_HOME;
    else process.env.VEB_HOME = prevVeb;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("writeClipMode validates the mode before writing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "motif-mode-"));
  try {
    assert.throws(() => writeClipMode({ work: dir, mode: "cinema" }), /Unknown mode/);
    writeClipMode({ work: dir, mode: "light" });
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "mode.json"), "utf8")).mode, "light");
    assert.throws(() => writeClipMode({ work: path.join(dir, "missing"), mode: "light" }), /not found/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("editingStatus reports a clip's real artifacts from disk", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "motif-status-"));
  const prevVeb = process.env.VEB_HOME;
  process.env.VEB_HOME = home;
  try {
    fs.writeFileSync(path.join(home, "profile.json"), JSON.stringify({ handle: "@me", bg: "#111111", acc: "#ffaa00", ink: "#ffffff", font: "Cairo" }));
    const clip = path.join(home, "projects", "status-clip");
    fs.mkdirSync(clip, { recursive: true });
    fs.writeFileSync(path.join(clip, "caps.json"), JSON.stringify({ total: 42.5, cards: [{ s: 0, e: 1, w: [] }, { s: 1, e: 2, w: [] }] }));
    fs.writeFileSync(path.join(clip, "stage.json"), JSON.stringify([{ s: 0, e: 1, m: "FULL" }, { s: 1, e: 2, m: "CARD" }]));
    fs.writeFileSync(path.join(clip, "src.mov"), "x");
    fs.writeFileSync(path.join(clip, "mode.json"), JSON.stringify({ mode: "light" }));

    const status = editingStatus();
    assert.equal(status.profileReady, true);
    assert.equal(status.identity.handle, "@me");
    assert.equal(status.projects.length, 1);
    const p = status.projects[0];
    assert.equal(p.name, "status-clip");
    assert.equal(p.mode, "light");
    assert.equal(p.durationSec, 42.5);
    assert.equal(p.scenes, 1);
    assert.equal(p.files.src, true);
    assert.equal(p.files.caps, true);
    assert.equal(p.files.final, false);
  } finally {
    if (prevVeb === undefined) delete process.env.VEB_HOME;
    else process.env.VEB_HOME = prevVeb;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
