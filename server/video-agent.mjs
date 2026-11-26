/**
 * MOTIF Video Agent — the `video-edit` skill is the stack the local agent runs on.
 *
 * `video-edit/stack.json` is the machine-readable manifest the agent (and the MCP
 * client) plans with: work folder, modes, stages, commands, validators, red lines.
 * `video-edit/SKILL.md` is the prose the agent executes; never duplicated here.
 *
 * Three layers share this module:
 *  - the stdio MCP server (mcp/motif-mcp.mjs) exposes it to Claude/Cursor/Codex,
 *  - the HTTP server (server/motif-server.mjs) serves /api/video/edit/* to the UI,
 *  - the MOTIF desktop agent screen renders it and starts real work off it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..");
export const SKILL_DIR = path.join(REPO_ROOT, "video-edit");
export const STACK_FILE = path.join(SKILL_DIR, "stack.json");
export const SKILL_FILE = path.join(SKILL_DIR, "SKILL.md");
const SCRIPTS_DIR = path.join(SKILL_DIR, "scripts");

let cachedStack = null;

/** The manifest as published in the repo (read-only — the skill folder is never written). */
export function readStack() {
  if (cachedStack) return cachedStack;
  const raw = fs.readFileSync(STACK_FILE, "utf8").replace(/^\uFEFF/, "");
  cachedStack = JSON.parse(raw);
  return cachedStack;
}

/** The user's editing data home — same rule as video-edit/scripts/_paths.py and _paths.js. */
export function editingHome(
  env = process.env,
  platform = process.platform,
  home = os.homedir(),
  exists = (p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
) {
  if (env.VEB_HOME) return env.VEB_HOME;
  if (platform !== "win32") return path.join(home, "Documents", "video-edit");
  const plain = path.win32.join(home, "Documents", "video-edit");
  const od = env.OneDrive || env.OneDriveConsumer || env.OneDriveCommercial;
  const synced = Boolean(od) && exists(path.win32.join(od, "Documents"));
  const risky = /[^\x20-\x7e]/.test(plain) || /onedrive/i.test(plain) || /[\\/]AppData[\\/]/i.test(plain);
  return risky || synced ? path.win32.join("C:\\", "EditStudio") : plain;
}

function resolveEditingHome() {
  return editingHome(process.env, process.platform, os.homedir());
}

/** Windows-safe clip name (same rules as the skill: : ? * " < > | / \ → -, no trailing dot/space). */
export function safeClipName(name) {
  const s = String(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .trim()
    .replace(/[ .]+$/, "");
  return s.slice(0, 80);
}

function readJsonIfExists(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function stamp(p) {
  try {
    const s = fs.statSync(p);
    return { size: s.size, mtime: new Date(s.mtimeMs).toISOString() };
  } catch {
    return null;
  }
}

/** Work folders under <home>/projects with their real state on disk. */
export function listProjects(home = resolveEditingHome()) {
  const root = path.join(home, "projects");
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = path.join(root, entry.name);
    const caps = readJsonIfExists(path.join(dir, "caps.json"));
    const mode = readJsonIfExists(path.join(dir, "mode.json"))?.mode || "full";
    const stage = readJsonIfExists(path.join(dir, "stage.json"));
    const theme = readJsonIfExists(path.join(dir, "theme.json"));
    const has = (f) => fs.existsSync(path.join(dir, f));
    const finalMp4 = has("ad-final.mp4");
    const masterMp4 = has("ad-master.mp4");
    const delivered = finalMp4 || masterMp4;
    out.push({
      name: entry.name,
      dir,
      mode,
      durationSec: typeof caps?.total === "number" ? Math.round(caps.total * 10) / 10 : null,
      wordCards: Array.isArray(caps?.cards) ? caps.cards.length : 0,
      scenes: Array.isArray(stage) ? stage.filter((s) => s.m !== "FULL").length : 0,
      frame: theme?.frame || "tall",
      style: readJsonIfExists(path.join(dir, "style.json"))?.style || "simple",
      files: {
        src: has("src.mov"),
        cutz: has("cutz.mp4"),
        caps: has("caps.json"),
        scenes: has("Scenes.tsx"),
        sfx: has("sfx.wav") || has("sfx.json"),
        final: finalMp4,
        master: masterMp4,
      },
      delivered,
      updatedAt: (stamp(path.join(dir, "caps.json")) || stamp(dir))?.mtime || null,
    });
  }
  return out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

/** Which pipeline stages already left their artifacts in a work folder. */
export function detectProgress(project) {
  const f = project?.files || {};
  return {
    setup: true,
    start: true,
    source: Boolean(f.src),
    cut: fs.existsSync(path.join(project.dir, "cut.json")),
    transcribe: fs.existsSync(path.join(project.dir, "a.json")),
    captions: Boolean(f.caps),
    script_review: fs.existsSync(path.join(project.dir, "script.txt")),
    cutzoom: Boolean(f.cutz),
    scenes: Boolean(f.scenes) && (project.scenes || 0) > 0,
    sfx: Boolean(f.sfx),
    render: Boolean(f.final) || Boolean(f.master),
    master: Boolean(f.master),
    srt: Boolean((project.srtFiles || []).length),
    verify: fs.existsSync(path.join(project.dir, "sheet.jpg")),
    deliver: Boolean((project.deliverFiles || []).length),
    ledger_board: false,
    studio: false,
  };
}

function listFilesEndingWith(dir, suffixes) {
  try {
    return fs.readdirSync(dir).filter((f) => suffixes.some((s) => f.toLowerCase().endsWith(s)));
  } catch {
    return [];
  }
}

function withDeliveryFiles(project) {
  return {
    ...project,
    srtFiles: listFilesEndingWith(project.dir, [".srt", ".txt"]),
    deliverFiles: listFilesEndingWith(project.dir, ["نسخة", "-copy"]).filter((f) => f.endsWith(".mp4")),
  };
}

/** Status for the agent screen and `video_edit_status`: readiness + projects + what's missing. */
export function editingStatus() {
  const stack = readStack();
  const home = resolveEditingHome();
  const homeReady = isDir(home);
  const profile = homeReady ? readJsonIfExists(path.join(home, "profile.json")) : null;
  const remotion = homeReady && isDir(path.join(home, "remotion-shared", "node_modules", "remotion"));
  const sounds = homeReady ? listFilesEndingWith(path.join(home, "sounds"), [".wav", ".mp3", ".m4a", ".ogg"]) : [];
  const projects = listProjects(home).map(withDeliveryFiles);
  return {
    stack: { name: stack.name, version: stack.version, entrypoint: stack.entrypoint, updated: stack.updated },
    skillDir: SKILL_DIR,
    home,
    homeReady,
    profileReady: Boolean(profile),
    identity: profile
      ? {
          handle: profile.handle || "",
          bg: profile.bg || "",
          ink: profile.ink || "",
          acc: profile.acc || "",
          font: profile.font || "",
          style: profile.prefs?.style || "simple",
          numerals: profile.numerals || "western",
        }
      : null,
    engine: { remotionReady: remotion, sharedDir: path.join(home, "remotion-shared") },
    sounds: sounds.length,
    projects,
    stageCount: stack.stages.length,
    modes: Object.keys(stack.modes),
    redLines: stack.redLines.length,
  };
}

/** Commands for one stage in one mode, with the real work folder filled in. */
export function stagePlan({ stageId, mode = "full", work, name }) {
  const stack = readStack();
  const stage = stack.stages.find((s) => s.id === stageId);
  if (!stage) throw Object.assign(new Error(`Unknown stage: ${stageId}`), { code: -32602 });
  const workDir = path.resolve(String(work || ""));
  const clipName = name || path.basename(workDir);
  const fill = (c) =>
    c
      .replaceAll("{work}", workDir.replace(/\\/g, "/"))
      .replaceAll("{name}", clipName);
  const commands = (stage.commands || []).map(fill);
  const style = readJsonIfExists(path.join(workDir, "style.json"))?.style || "simple";
  if (stage.id === "sfx" && style === "collage") commands.push(...(stage.collageCommands || []).map(fill));
  return {
    mode,
    stage: { id: stage.id, n: stage.n, title: stage.title, doc: stage.doc, note: stage.note, optional: Boolean(stage.optional) },
    work: workDir,
    name: clipName,
    commands,
    checks: (stage.checks || []).map(fill),
    artifactExpected: stage.artifacts || null,
    rule: "Read the stage's doc before running it; a validator exit 3 means stop — never render past a failed gate.",
  };
}

/** The ordered stage plan for a whole clip (this is what `video_edit_plan` returns). */
export function clipPlan({ name, mode = "full", frame = "tall", source }) {
  const stack = readStack();
  const clip = safeClipName(name);
  if (!clip) throw Object.assign(new Error("Clip name is required"), { status: 400 });
  if (!stack.modes[mode]) throw Object.assign(new Error(`Unknown mode: ${mode}`), { status: 400 });
  const home = resolveEditingHome();
  const work = path.join(home, "projects", clip);
  const steps = stack.modes[mode].stages.map((id) => stagePlan({ stageId: id, mode, work, name: clip }));
  return {
    mode,
    name: clip,
    frame,
    source: source || path.join(work, "src.mov"),
    work,
    steps: steps.map((s) => ({
      id: s.stage.id,
      n: s.stage.n,
      title: s.stage.title,
      commands: s.commands,
      checks: s.checks,
    })),
  };
}

export function writeClipMode({ work, mode }) {
  const stack = readStack();
  if (!stack.modes[mode]) throw Object.assign(new Error(`Unknown mode: ${mode}`), { status: 400 });
  const dir = path.resolve(String(work || ""));
  if (!isDir(dir)) throw Object.assign(new Error(`Work folder not found: ${dir}`), { status: 404 });
  const payload = { mode };
  fs.writeFileSync(path.join(dir, "mode.json"), `${JSON.stringify(payload, null, 1)}\n`, "utf8");
  return { ok: true, work: dir, mode };
}

const RUN_ALLOWED = new Set([
  "01_cut_plan.py",
  "01b_transcribe.py",
  "02_captions.py",
  "03_cut_zoom.py",
  "05_sfx.py",
  "05b_sfx_audit.py",
  "12_face_guard.js",
  "18_stage_from_scenes.py",
  "19_scene_audit.py",
  "22_preflight.py",
]);

/** The validator gate: exit 3 from any of these means "do not render". */
export const GATE_SCRIPTS = Object.freeze({
  "05b_sfx_audit.py": 3,
  "19_scene_audit.py": 3,
  "22_preflight.py": 3,
  "12_face_guard.js": 3,
});

/**
 * Launch an editing script from the skill without a terminal. This is what the
 * desktop agent screen and `video_edit_run` call — it is the agent's real hands.
 * Only scripts from a fixed allowlist run, work must be an existing folder.
 */
export function runStage({ stageId, work, name, mode = "full", onLine, timeoutMs = 900_000 }) {
  const plan = stagePlan({ stageId, mode, work, name });
  const allowed = plan.commands.filter((c) => {
    const m = c.match(/python3 scripts\/([\w.-]+\.py)/) || c.match(/node scripts\/([\w.-]+\.js)/);
    return m && RUN_ALLOWED.has(m[1]);
  });
  if (!allowed.length) {
    throw Object.assign(new Error(`Stage "${stageId}" has no runnable step — read its doc and let the agent compose it.`), {
      status: 400,
      code: "NOT_RUNNABLE",
    });
  }
  const cmd = allowed[0];
  const py = cmd.startsWith("python3 ") ? "python3" : "node";
  const args = cmd.replace(/^(python3|node) /, "").match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g).map((a) => a.replace(/^["']|["']$/g, ""));
  return new Promise((resolve) => {
    const started = Date.now();
    const lines = [];
    const child = spawn(py, args, {
      cwd: SKILL_DIR,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunk) => {
      const text = String(chunk);
      lines.push(text);
      onLine?.(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command: cmd,
        exitCode: code,
        gate: GATE_SCRIPTS[cmd.split(/[\\/]/).pop()] === code ? "refused" : code === 0 ? "ok" : "error",
        elapsedMs: Date.now() - started,
        output: lines.join("").slice(-4500),
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ command: cmd, exitCode: -1, gate: "error", elapsedMs: Date.now() - started, output: String(err?.message || err) });
    });
  });
}

/** The one instruction block an external agent reads before touching the pipeline. */
export function agentBrief({ project, brand } = {}) {
  const stack = readStack();
  const rules = stack.redLines.map((r) => `- ${r.en} / ${r.ar}`).join("\n");
  return [
    `MOTIF Video Agent brief — stack "${stack.name}" v${stack.version} (${stack.entrypoint}).`,
    `You are the assistant inside MOTIF Studio. The video-edit skill is the ONLY pipeline you run on.`,
    project
      ? `Current clip: ${project.name} — folder ${project.dir} — mode ${project.mode} — ${project.durationSec ?? "?"}s.`
      : "No clip selected — call video_edit_status and list the projects first.",
    brand ? `Brand: ${brand.name} — color ${brand.colors?.[0] || "n/a"} — voice ${brand.voice || "n/a"}.` : "",
    "",
    "Workflow: video_edit_plan(mode) → stage by stage in order (video_edit_stage) → run commands from the skill folder → read the stage doc listed in the plan before writing scenes → a validator exit 3 stops the line: fix, never render past it.",
    "",
    "Hard red lines:",
    rules,
    "",
    "When you finish: report duration, removed silence, scene count, and that nothing was published. Never delete the work folder.",
  ]
    .filter(Boolean)
    .join("\n");
}

export { SCRIPTS_DIR };
