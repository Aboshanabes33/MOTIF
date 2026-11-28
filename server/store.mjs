import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB per AGENT.md / CLAUDE.md
const MAX_LOGO_DATA_URL_LEN = Math.ceil(MAX_LOGO_BYTES * 1.4) + 256;
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;
const PROJECT_STATUSES = new Set([
  "preparing",
  "editing",
  "rendering",
  "exported",
  "approved",
  "slim",
]);

/**
 * Resolve MOTIF data root directory.
 * Priority: explicit opt -> MOTIF_DATA -> STUDIO_DATA -> MOHRER_HOME parent -> default ~/Documents/video-edit/studio (or C:\EditStudio\studio on Windows if risky)
 */
export function resolveDataPaths(opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;

  let dataDir;
  if (opts.dataDir) {
    dataDir = path.resolve(opts.dataDir);
  } else if (env.MOTIF_DATA) {
    dataDir = path.resolve(env.MOTIF_DATA);
  } else if (env.STUDIO_DATA) {
    dataDir = path.resolve(env.STUDIO_DATA);
  } else if (env.MOTIF_HOME || env.MOHRER_HOME) {
    dataDir = path.dirname(path.resolve(env.MOTIF_HOME || env.MOHRER_HOME));
  } else if (env.VEB_HOME) {
    dataDir = path.join(path.resolve(env.VEB_HOME), "studio");
  } else {
    const home = os.homedir();
    if (platform === "win32") {
      const localAppData = env.LOCALAPPDATA || path.join(home, "AppData", "Local");
      dataDir = path.join(localAppData, "MOTIF");
    } else {
      dataDir = path.join(home, "Documents", "video-edit", "studio");
    }
  }

  const homeDir = opts.homeDir
    ? path.resolve(opts.homeDir)
    : env.MOTIF_HOME
      ? path.resolve(env.MOTIF_HOME)
      : env.MOHRER_HOME
        ? path.resolve(env.MOHRER_HOME)
        : path.join(dataDir, "home");

  const projectsDir = opts.projectsDir
    ? path.resolve(opts.projectsDir)
    : path.join(dataDir, "projects");

  const voiceDir = path.join(dataDir, "voice-notes");
  const footageDir = path.join(dataDir, "footage");
  const prefsFile = path.join(homeDir, "prefs.json");
  const workspaceFile = path.join(homeDir, "workspace.json");
  const activityFile = path.join(homeDir, "activity.json");
  const serverInfoFile = path.join(homeDir, "motif-server.json");

  return {
    dataDir,
    homeDir,
    projectsDir,
    voiceDir,
    footageDir,
    prefsFile,
    workspaceFile,
    activityFile,
    serverInfoFile,
  };
}

function ensureDirs(paths) {
  for (const dir of [paths.dataDir, paths.homeDir, paths.projectsDir, paths.voiceDir, paths.footageDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function atomicWriteJson(filePath, data, { backup = false } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (backup && fs.existsSync(filePath)) {
    try {
      const bakTmp = `${filePath}.bak.${process.pid}.tmp`;
      fs.copyFileSync(filePath, bakTmp);
      fs.renameSync(bakTmp, `${filePath}.bak`);
    } catch {
      // best effort backup
    }
  }
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, filePath);
}

function safeReadJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function stripSensitivePreferenceKeys(value) {
  if (Array.isArray(value)) return value.map(stripSensitivePreferenceKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(?:secret|token|password|dsn|api.?key|public.?key)/i.test(key))
    .map(([key, item]) => [key, stripSensitivePreferenceKeys(item)]));
}

export function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (!HEX_COLOR_RE.test(s)) return null;
  if (s.length === 4) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return s.toLowerCase();
}

export function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return Buffer.byteLength(dataUrl, "utf8");
  const b64 = dataUrl.slice(comma + 1);
  return Math.floor((b64.length * 3) / 4);
}

export function validateAndNormalizeBrand(input, existingId = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("Brand payload must be an object"), {
      code: "BRAND_INVALID",
      status: 400,
    });
  }

  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) {
    throw Object.assign(new Error("Brand name is required"), {
      code: "BRAND_NAME_REQUIRED",
      status: 400,
    });
  }

  const id =
    existingId ||
    (typeof input.id === "string" && input.id.trim()
      ? input.id.trim().slice(0, 64)
      : `b_${crypto.randomBytes(5).toString("hex")}`);

  let logo = "";
  if (typeof input.logo === "string" && input.logo.trim()) {
    const trimmed = input.logo.trim();
    if (!DATA_IMAGE_RE.test(trimmed)) {
      throw Object.assign(new Error("Brand logo must be a valid image data URL (PNG, JPG, WebP, GIF, or SVG)"), {
        code: "BRAND_LOGO_INVALID",
        status: 400,
      });
    }
    if (trimmed.length > MAX_LOGO_DATA_URL_LEN || estimateDataUrlBytes(trimmed) > MAX_LOGO_BYTES) {
      throw Object.assign(new Error("Brand logo exceeds the 2 MB limit"), {
        code: "BRAND_LOGO_TOO_LARGE",
        status: 400,
      });
    }
    logo = trimmed;
  }

  const rawColors = Array.isArray(input.colors) ? input.colors : [];
  const colors = [];
  for (const c of rawColors) {
    const hex = normalizeHexColor(c);
    if (hex && !colors.includes(hex)) {
      colors.push(hex);
      if (colors.length >= 4) break;
    }
  }
  if (colors.length === 0) {
    colors.push("#2f7268", "#9fd8cd");
  }

  const now = new Date().toISOString();
  return {
    id,
    name,
    tagline: String(input.tagline ?? "").trim().slice(0, 160),
    logo,
    colors,
    audience: String(input.audience ?? "").trim().slice(0, 240),
    voice: String(input.voice ?? "").trim().slice(0, 240),
    channels: String(input.channels ?? "").trim().slice(0, 240),
    notes: String(input.notes ?? "").trim().slice(0, 2000),
    createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : now,
    updatedAt: now,
  };
}

/** The demo brand behind the "Example" button — one click, never seeded automatically. */
export const EXAMPLE_BRAND = Object.freeze({
  name: "Qafila · قافلة",
  tagline: "Cinematic Arabic tech & storytelling",
  logo: "",
  colors: ["#2f7268", "#9fd8cd", "#f2b880", "#0c2729"],
  audience: "Arabic-speaking founders, creators, and filmmakers (20–38)",
  voice: "Calm, insightful, crisp pacing with dry wit and warm editorial tone",
  channels: "YouTube, Instagram Reels, TikTok",
  notes:
    "Use clean mint accents on dark teal lower-thirds. Prefer 9:16 vertical cuts under 58 seconds with bold Arabic captions.",
});

/** A ready-to-save example brand, stamped now (ids/timestamps are fresh every call). */
export function exampleBrand() {
  const now = new Date().toISOString();
  return { ...EXAMPLE_BRAND, colors: [...EXAMPLE_BRAND.colors], createdAt: now, updatedAt: now };
}

function defaultAiEdit(project = {}) {
  const duration = Math.max(12, Number(project.durationSec) || 42);
  return {
    engine: "remotion",
    agentSummary: project.summary || "The AI agent shaped the pacing, captions, and motion design for this edit.",
    stats: { cuts: 8, scenes: 4, captions: 12, motionGraphics: 3 },
    actions: [
      { at: 0, title: "Selected the opening hook", detail: "Trimmed the intro to get to the story faster." },
      { at: Math.round(duration * 0.22), title: "Reframed key moments", detail: "Matched motion and pacing to the brand." },
      { at: Math.round(duration * 0.58), title: "Added captions and motion", detail: "Created readable bilingual captions and a branded title." },
    ],
    scenes: [
      { id: "hook", title: "Opening hook", start: 0, duration: Math.round(duration * 0.22), motion: "rise" },
      { id: "story", title: "Main story", start: Math.round(duration * 0.22), duration: Math.round(duration * 0.45), motion: "reveal" },
      { id: "detail", title: "Details", start: Math.round(duration * 0.67), duration: Math.round(duration * 0.22), motion: "float" },
      { id: "outro", title: "Brand outro", start: Math.round(duration * 0.89), duration: Math.max(3, Math.round(duration * 0.11)), motion: "fade" },
    ],
    captions: ["A story worth watching", "Crafted with intention", "Made for your next moment"],
  };
}

function makeStarterData() {
  const now = new Date();
  const iso = (minsAgo) => new Date(now.getTime() - minsAgo * 60_000).toISOString();

  const brands = [
    {
      id: "b_qafila01",
      ...exampleBrand(),
      createdAt: iso(1440),
      updatedAt: iso(90),
    },
    {
      id: "b_noor02",
      name: "Noor Roastery · محمصة نور",
      tagline: "Specialty single-origin coffee craft",
      logo: "",
      colors: ["#b5673b", "#e8c8a0", "#2d241e", "#f7f1e8"],
      audience: "Coffee enthusiasts & boutique café visitors across the Gulf",
      voice: "Sensory, unhurried, tactile visual storytelling",
      channels: "Instagram Reels, Snapchat Spotlight, TikTok",
      notes: "Warm film grain, slow-motion pour shots (60fps conformed to 24fps), minimal serif titles.",
      createdAt: iso(2880),
      updatedAt: iso(240),
    },
    {
      id: "b_madar03",
      name: "Madar AI · مدار",
      tagline: "Spatial tools for independent studios",
      logo: "",
      colors: ["#3a7ca5", "#9fd8cd", "#172a3a", "#e6f2f5"],
      audience: "Product designers, indie developers, AI workflows",
      voice: "Direct, technical yet human, demo-first",
      channels: "YouTube, X Video, LinkedIn",
      notes: "Always open with a 3-second real product hook before explaining architecture.",
      createdAt: iso(4320),
      updatedAt: iso(360),
    },
  ];

  const projects = [
    {
      id: "proj_launch_reel",
      folder: "motif-2-launch-reel",
      name: "MOTIF 2.0 Launch Film",
      brandId: "b_qafila01",
      status: "rendering",
      progress: 68,
      aspect: "16:9",
      durationSec: 84,
      resolution: "3840×2160",
      fps: 30,
      accentFrom: "#2f7268",
      accentTo: "#0f2f30",
      summary: "Hero desktop walkthrough highlighting Liquid Glass workspace and live MCP brand context.",
      notes: "Tighten the opening 4 seconds; bump voice clarity +1.5 dB.",
      createdAt: iso(320),
      updatedAt: iso(8),
    },
    {
      id: "proj_noor_pour",
      folder: "noor-ethiopia-pour",
      name: "Ethiopia Guji — Morning Pour",
      brandId: "b_noor02",
      status: "editing",
      progress: 45,
      aspect: "9:16",
      durationSec: 42,
      resolution: "1080×1920",
      fps: 24,
      accentFrom: "#7d4a2d",
      accentTo: "#1f1814",
      summary: "Macro slow-motion pour-over reel with bilingual Arabic/English tasting notes.",
      notes: "Keep ambient grinder sound under the intro transition.",
      createdAt: iso(720),
      updatedAt: iso(35),
    },
    {
      id: "proj_mcp_demo",
      folder: "madar-mcp-agent-demo",
      name: "MCP Brand Agent Workflow",
      brandId: "b_madar03",
      status: "exported",
      progress: 100,
      aspect: "16:9",
      durationSec: 126,
      resolution: "1920×1080",
      fps: 30,
      accentFrom: "#235573",
      accentTo: "#0c1d29",
      summary: "End-to-end screen capture showing Claude inspecting MOTIF brands and drafting a shot list.",
      notes: "Exported master v2 — ready for YouTube publish.",
      createdAt: iso(1300),
      updatedAt: iso(110),
    },
    {
      id: "proj_behind_glass",
      folder: "liquid-glass-design-diary",
      name: "Behind the Liquid Glass UI",
      brandId: "b_qafila01",
      status: "approved",
      progress: 100,
      aspect: "9:16",
      durationSec: 56,
      resolution: "1080×1920",
      fps: 30,
      accentFrom: "#1f5a52",
      accentTo: "#0b2224",
      summary: "Design breakdown of dark-teal atmospheric layering and restrained glass controls.",
      notes: "Approved by brand lead.",
      createdAt: iso(2200),
      updatedAt: iso(420),
    },
  ];

  const footage = [
    {
      id: "ft_a01",
      name: "A-Roll_Desk_4K_Log.mov",
      kind: "video",
      durationSec: 148,
      resolution: "3840×2160",
      fps: 30,
      colorProfile: "D-Log M",
      sizeMB: 412,
      brandId: "b_qafila01",
      projectId: "proj_launch_reel",
      tags: ["a-roll", "studio", "4k"],
      createdAt: iso(340),
    },
    {
      id: "ft_b02",
      name: "PourOver_Macro_120fps.mp4",
      kind: "video",
      durationSec: 36,
      resolution: "1920×1080",
      fps: 120,
      colorProfile: "Rec.709",
      sizeMB: 184,
      brandId: "b_noor02",
      projectId: "proj_noor_pour",
      tags: ["b-roll", "slow-mo", "coffee"],
      createdAt: iso(740),
    },
    {
      id: "ft_c03",
      name: "UI_ScreenCapture_MCP_Call.mp4",
      kind: "video",
      durationSec: 94,
      resolution: "2560×1440",
      fps: 60,
      colorProfile: "sRGB",
      sizeMB: 128,
      brandId: "b_madar03",
      projectId: "proj_mcp_demo",
      tags: ["screen", "mcp", "demo"],
      createdAt: iso(1320),
    },
    {
      id: "ft_d04",
      name: "RoomTone_Warm_Ambient.wav",
      kind: "audio",
      durationSec: 60,
      resolution: "48 kHz · 24-bit",
      fps: 0,
      colorProfile: "Audio",
      sizeMB: 16,
      brandId: "b_qafila01",
      projectId: "proj_launch_reel",
      tags: ["audio", "ambient"],
      createdAt: iso(360),
    },
  ];

  const voiceNotes = [
    {
      id: "vn_intro01",
      title: "Opening hook timing — MOTIF 2.0",
      transcript: "Start directly on the desktop canvas with the mountains visible, then bring in the Brands view and show the MCP agent reading Qafila's exact palette.",
      durationSec: 18,
      brandId: "b_qafila01",
      projectId: "proj_launch_reel",
      hasAudio: false,
      audioFile: "",
      mimeType: "",
      createdAt: iso(42),
    },
    {
      id: "vn_roast02",
      title: "ملاحظة صوتية — محمصة نور",
      transcript: "نخلي أول ٣ ثواني صوت سكب القهوة بدون موسيقى، وبعدها يدخل عنوان المحمصة بخط هادئ وباللون النحاسي.",
      durationSec: 14,
      brandId: "b_noor02",
      projectId: "proj_noor_pour",
      hasAudio: false,
      audioFile: "",
      mimeType: "",
      createdAt: iso(190),
    },
  ];

  const activity = [
    {
      id: "act_01",
      source: "studio",
      type: "render",
      title: "Rendering MOTIF 2.0 Launch Film",
      detail: "68% · 4K 30fps master",
      timestamp: iso(4),
    },
    {
      id: "act_02",
      source: "mcp",
      type: "mcp_ready",
      title: "MCP Server ready for AI agents",
      detail: "22 tools & 18 resources registered (Brands, Projects, Footage, Voice Notes, Video Agent stack)",
      timestamp: iso(18),
    },
    {
      id: "act_03",
      source: "user",
      type: "voice_note",
      title: "Recorded voice note for Qafila",
      detail: "Opening hook timing — MOTIF 2.0 (0:18)",
      timestamp: iso(42),
    },
  ];

  return { brands, projects: projects.map((project) => ({ ...project, aiEdit: defaultAiEdit(project) })), footage, voiceNotes, activity };
}

export function createMotifStore(opts = {}) {
  const paths = resolveDataPaths(opts);
  // Fresh start is the default: a new user begins with zero brands.
  // The demo workspace (Qafila + projects + footage + notes) is only seeded when
  // explicitly requested — `MOTIF_DEMO=1` (full demo workspace) or the Example button (one brand).
  const demoInit =
    typeof opts.demoInit === "boolean" ? opts.demoInit : process.env.MOTIF_DEMO === "1";
  const cleanInit = opts.cleanInit === true || (opts.cleanInit === undefined && !demoInit);

  ensureDirs(paths);

  function initializeIfNeeded() {
    const hasPrefs = fs.existsSync(paths.prefsFile);
    const hasWorkspace = fs.existsSync(paths.workspaceFile);
    if (hasPrefs && hasWorkspace) return;

    const starter = cleanInit
      ? { brands: [], projects: [], footage: [], voiceNotes: [], activity: [] }
      : makeStarterData();

    if (!hasPrefs) {
      atomicWriteJson(paths.prefsFile, {
        projectsRoot: paths.projectsDir,
        lang: "en",
        onboardingCompleted: false,
        telemetryEnabled: true,
        brands: starter.brands,
      });
    }
    if (!hasWorkspace) {
      atomicWriteJson(paths.workspaceFile, {
        version: 2,
        projects: starter.projects,
        folders: [],
        footage: starter.footage,
        voiceNotes: starter.voiceNotes,
      });
    }
    if (!fs.existsSync(paths.activityFile)) {
      atomicWriteJson(paths.activityFile, { events: starter.activity });
    }
  }

  initializeIfNeeded();

  // Read any legacy edit-studio disk projects inside projectsDir and merge seamlessly
  function scanDiskProjects(existingProjects) {
    const knownFolders = new Set(existingProjects.map((p) => p.folder).filter(Boolean));
    const discovered = [];
    try {
      const entries = fs.readdirSync(paths.projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        if (knownFolders.has(entry.name)) continue;
        const pjPath = path.join(paths.projectsDir, entry.name, "project.json");
        if (!fs.existsSync(pjPath)) continue;
        const pj = safeReadJson(pjPath, null);
        if (!pj) continue;
        const stat = fs.statSync(pjPath);
        discovered.push({
          id: `disk_${entry.name}`,
          folder: entry.name,
          name: String(pj.name || entry.name),
          brandId: pj.meta?.brandId || "",
          status: PROJECT_STATUSES.has(pj.meta?.status) ? pj.meta.status : "editing",
          progress: pj.meta?.status === "exported" || pj.meta?.status === "approved" ? 100 : 50,
          aspect: pj.frame && pj.frame.w > pj.frame.h ? "16:9" : "9:16",
          durationSec: Math.round((pj.duration || 0) / Math.max(1, pj.fps?.[0] || 30)),
          resolution: pj.frame ? `${pj.frame.w}×${pj.frame.h}` : "1080×1920",
          fps: Array.isArray(pj.fps) ? pj.fps[0] : 30,
          accentFrom: "#21574f",
          accentTo: "#0c2729",
          summary: "Imported editing project from the local projects folder.",
          notes: "",
          diskBacked: true,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
        });
      }
    } catch {
      // ignore unreadable projectsDir
    }
    return [...existingProjects, ...discovered];
  }

  function readPrefs() {
    const raw = safeReadJson(paths.prefsFile, {});
    const safePrefs = stripSensitivePreferenceKeys(raw);
    const brands = Array.isArray(raw.brands)
      ? raw.brands
          .filter((b) => b && typeof b === "object" && typeof b.name === "string" && b.name.trim())
          .map((b) => {
            try {
              return validateAndNormalizeBrand(b, b.id || null);
            } catch {
              return null;
            }
          })
          .filter(Boolean)
      : [];
    return {
      ...safePrefs,
      projectsRoot: raw.projectsRoot || paths.projectsDir,
      brands,
    };
  }

  function writePrefs(nextPrefs) {
    if (!nextPrefs || typeof nextPrefs !== "object" || Array.isArray(nextPrefs)) {
      throw Object.assign(new Error("Preferences must be a JSON object"), { status: 400 });
    }
    const current = readPrefs();
    const merged = stripSensitivePreferenceKeys({ ...current, ...nextPrefs });
    if ("brands" in nextPrefs) {
      if (!Array.isArray(nextPrefs.brands)) {
        throw Object.assign(new Error("brands must be an array"), { status: 400 });
      }
      merged.brands = nextPrefs.brands.map((b) => validateAndNormalizeBrand(b, b?.id || null));
    }
    atomicWriteJson(paths.prefsFile, merged, { backup: true });
    return merged;
  }

  function readWorkspace() {
    const ws = safeReadJson(paths.workspaceFile, {
      version: 2,
      projects: [],
      folders: [],
      footage: [],
      voiceNotes: [],
    });
    return {
      version: ws.version || 2,
      projects: Array.isArray(ws.projects) ? ws.projects : [],
      folders: Array.isArray(ws.folders) ? ws.folders : [],
      footage: Array.isArray(ws.footage) ? ws.footage : [],
      voiceNotes: Array.isArray(ws.voiceNotes) ? ws.voiceNotes : [],
    };
  }

  function writeWorkspace(next) {
    atomicWriteJson(paths.workspaceFile, next, { backup: true });
    return next;
  }

  function listActivity(limit = 30) {
    const data = safeReadJson(paths.activityFile, { events: [] });
    const list = Array.isArray(data.events) ? data.events : [];
    return list.slice(0, Math.max(1, Math.min(100, limit)));
  }

  function recordActivity({ source = "user", type = "info", title, detail = "", meta = null }) {
    if (!title) return null;
    const data = safeReadJson(paths.activityFile, { events: [] });
    const list = Array.isArray(data.events) ? data.events : [];
    const item = {
      id: `act_${crypto.randomBytes(4).toString("hex")}`,
      source,
      type,
      title: String(title).slice(0, 180),
      detail: String(detail || "").slice(0, 320),
      meta: meta && typeof meta === "object" ? meta : undefined,
      timestamp: new Date().toISOString(),
    };
    const next = [item, ...list].slice(0, 80);
    atomicWriteJson(paths.activityFile, { events: next });
    return item;
  }

  // --- Brand CRUD (canonical source of truth: prefs.json) ---
  function listBrands() {
    return readPrefs().brands;
  }

  function getBrand(idOrName) {
    const q = String(idOrName || "").trim();
    if (!q) return null;
    const brands = listBrands();
    const exactId = brands.find((b) => b.id === q);
    if (exactId) return exactId;
    const lower = q.toLowerCase();
    return (
      brands.find((b) => b.name.toLowerCase() === lower) ||
      brands.find((b) => b.name.toLowerCase().includes(lower)) ||
      null
    );
  }

  function createBrand(payload, { source = "user" } = {}) {
    const prefs = readPrefs();
    const brand = validateAndNormalizeBrand(payload);
    prefs.brands = [brand, ...prefs.brands];
    atomicWriteJson(paths.prefsFile, prefs, { backup: true });
    recordActivity({
      source,
      type: "brand_created",
      title: `Created brand “${brand.name}”`,
      detail: brand.tagline || `${brand.colors.length} brand colors saved`,
      meta: { brandId: brand.id },
    });
    return brand;
  }

  function updateBrand(id, patch, { source = "user" } = {}) {
    const prefs = readPrefs();
    const idx = prefs.brands.findIndex((b) => b.id === id);
    if (idx < 0) {
      throw Object.assign(new Error(`Brand not found: ${id}`), { status: 404, code: "BRAND_NOT_FOUND" });
    }
    const existing = prefs.brands[idx];
    const updated = validateAndNormalizeBrand({ ...existing, ...patch, createdAt: existing.createdAt }, existing.id);
    prefs.brands[idx] = updated;
    atomicWriteJson(paths.prefsFile, prefs, { backup: true });
    recordActivity({
      source,
      type: "brand_updated",
      title: `Updated brand “${updated.name}”`,
      detail: updated.tagline || "Brand identity saved to prefs.json",
      meta: { brandId: updated.id },
    });
    return updated;
  }

  function deleteBrand(id, { source = "user" } = {}) {
    const prefs = readPrefs();
    const target = prefs.brands.find((b) => b.id === id);
    if (!target) {
      throw Object.assign(new Error(`Brand not found: ${id}`), { status: 404, code: "BRAND_NOT_FOUND" });
    }
    prefs.brands = prefs.brands.filter((b) => b.id !== id);
    atomicWriteJson(paths.prefsFile, prefs, { backup: true });
    recordActivity({
      source,
      type: "brand_deleted",
      title: `Deleted brand “${target.name}”`,
      detail: "Removed from prefs.json",
      meta: { brandId: id },
    });
    return { ok: true, deleted: target };
  }

  /**
   * Start over: empty brands, projects, footage, voice notes and activity.
   * Keeps the folder itself and any disk-backed projects (those live on disk, not here).
   */
  function resetWorkspace() {
    atomicWriteJson(paths.prefsFile, {
      projectsRoot: paths.projectsDir,
      lang: readPrefs().lang || "en",
      brands: [],
    }, { backup: true });
    atomicWriteJson(paths.workspaceFile, {
      version: 2,
      projects: [],
      folders: [],
      footage: [],
      voiceNotes: [],
    });
    atomicWriteJson(paths.activityFile, { events: [] });
    return { ok: true };
  }

  /**
   * The "Example" button: insert a realistic demo brand (Qafila) so a fresh user
   * can see what a complete brand looks like — one click, and it is a normal brand
   * they can edit or delete like any other. Repeated clicks return the existing one.
   */
  function createExampleBrand({ source = "user" } = {}) {
    const existing = listBrands().find((b) => b.name === EXAMPLE_BRAND.name);
    if (existing) return { ok: true, alreadyExisted: true, brand: existing };
    const brand = createBrand(exampleBrand(), { source });
    return { ok: true, alreadyExisted: false, brand };
  }

  // --- Projects ---
  function listProjects(filter = {}) {
    const ws = readWorkspace();
    let projects = scanDiskProjects(ws.projects);
    if (filter.brandId) {
      projects = projects.filter((p) => p.brandId === filter.brandId);
    }
    if (filter.status) {
      projects = projects.filter((p) => p.status === filter.status);
    }
    if (filter.query) {
      const q = String(filter.query).trim().toLowerCase();
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.summary || "").toLowerCase().includes(q) ||
          (p.notes || "").toLowerCase().includes(q) ||
          (p.folder || "").toLowerCase().includes(q),
      );
    }
    return projects.sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
  }

  function getProject(idOrFolder) {
    const q = String(idOrFolder || "").trim();
    if (!q) return null;
    const all = listProjects();
    return (
      all.find((p) => p.id === q || p.folder === q) ||
      all.find((p) => p.name.toLowerCase() === q.toLowerCase()) ||
      null
    );
  }

  function createProject(payload, { source = "user" } = {}) {
    const name = String(payload?.name ?? "").trim().slice(0, 120);
    if (!name) {
      throw Object.assign(new Error("Project name is required"), { status: 400 });
    }
    const ws = readWorkspace();
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || `clip-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const brand = payload.brandId ? getBrand(payload.brandId) : null;
    const status = PROJECT_STATUSES.has(payload.status) ? payload.status : "editing";
    const project = {
      id: `proj_${crypto.randomBytes(4).toString("hex")}`,
      folder: `${slug}-${crypto.randomBytes(2).toString("hex")}`,
      name,
      brandId: brand ? brand.id : "",
      status,
      progress: Number.isFinite(Number(payload.progress))
        ? Math.max(0, Math.min(100, Math.round(Number(payload.progress))))
        : status === "exported" || status === "approved"
          ? 100
          : status === "preparing"
            ? 15
            : 0,
      aspect: payload.aspect === "16:9" || payload.aspect === "1:1" ? payload.aspect : "9:16",
      durationSec: Number.isFinite(Number(payload.durationSec)) ? Math.max(0, Math.round(Number(payload.durationSec))) : 0,
      resolution:
        payload.resolution ||
        (payload.aspect === "16:9" ? "1920×1080" : payload.aspect === "1:1" ? "1080×1080" : "1080×1920"),
      fps: Number.isFinite(Number(payload.fps)) ? Number(payload.fps) : 30,
      accentFrom: brand?.colors?.[0] || "#2f7268",
      accentTo: "#0c2729",
      summary: String(payload.summary ?? "").trim().slice(0, 400),
      notes: String(payload.notes ?? "").trim().slice(0, 2000),
      aiEdit: payload.aiEdit && typeof payload.aiEdit === "object" ? payload.aiEdit : defaultAiEdit({ ...payload, durationSec: payload.durationSec || 42, summary: payload.summary }),
      createdAt: now,
      updatedAt: now,
    };
    ws.projects.unshift(project);
    writeWorkspace(ws);
    recordActivity({
      source,
      type: "project_created",
      title: `Created project “${project.name}”`,
      detail: `${project.aspect} · ${project.status}${brand ? ` · ${brand.name}` : ""}`,
      meta: { projectId: project.id, brandId: project.brandId || undefined },
    });
    return project;
  }

  function updateProject(id, patch, { source = "user" } = {}) {
    const ws = readWorkspace();
    const idx = ws.projects.findIndex((p) => p.id === id || p.folder === id);
    if (idx < 0) {
      throw Object.assign(new Error(`Project not found: ${id}`), { status: 404 });
    }
    const existing = ws.projects[idx];
    const nextBrandId = patch.brandId !== undefined ? String(patch.brandId || "") : existing.brandId;
    const brand = nextBrandId ? getBrand(nextBrandId) : null;
    const nextStatus = patch.status && PROJECT_STATUSES.has(patch.status) ? patch.status : existing.status;
    const updated = {
      ...existing,
      name: patch.name !== undefined ? String(patch.name).trim().slice(0, 120) || existing.name : existing.name,
      brandId: brand ? brand.id : nextBrandId === "" ? "" : existing.brandId,
      status: nextStatus,
      progress:
        patch.progress !== undefined && Number.isFinite(Number(patch.progress))
          ? Math.max(0, Math.min(100, Math.round(Number(patch.progress))))
          : existing.progress,
      aspect: patch.aspect === "16:9" || patch.aspect === "9:16" || patch.aspect === "1:1" ? patch.aspect : existing.aspect,
      durationSec:
        patch.durationSec !== undefined && Number.isFinite(Number(patch.durationSec))
          ? Math.max(0, Math.round(Number(patch.durationSec)))
          : existing.durationSec,
      summary: patch.summary !== undefined ? String(patch.summary).trim().slice(0, 400) : existing.summary,
      notes: patch.notes !== undefined ? String(patch.notes).trim().slice(0, 2000) : existing.notes,
      aiEdit: patch.aiEdit && typeof patch.aiEdit === "object" ? patch.aiEdit : existing.aiEdit,
      accentFrom: brand?.colors?.[0] || existing.accentFrom,
      updatedAt: new Date().toISOString(),
    };
    ws.projects[idx] = updated;
    writeWorkspace(ws);
    recordActivity({
      source,
      type: "project_updated",
      title: `Updated project “${updated.name}”`,
      detail: `${updated.status} · ${updated.progress}%`,
      meta: { projectId: updated.id },
    });
    return updated;
  }

  function deleteProject(id, { source = "user" } = {}) {
    const ws = readWorkspace();
    const target = ws.projects.find((p) => p.id === id || p.folder === id);
    if (!target) {
      throw Object.assign(new Error(`Project not found: ${id}`), { status: 404 });
    }
    ws.projects = ws.projects.filter((p) => p.id !== target.id);
    writeWorkspace(ws);
    recordActivity({
      source,
      type: "project_deleted",
      title: `Deleted project “${target.name}”`,
      detail: "Removed from workspace",
    });
    return { ok: true, deleted: target };
  }

  // --- Footage ---
  function listFootage(filter = {}) {
    const ws = readWorkspace();
    let list = ws.footage;
    if (filter.brandId) list = list.filter((f) => f.brandId === filter.brandId);
    if (filter.projectId) list = list.filter((f) => f.projectId === filter.projectId);
    return [...list].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  }

  function addFootage(payload, { source = "user" } = {}) {
    const name = String(payload?.name ?? "").trim().slice(0, 160);
    if (!name) {
      throw Object.assign(new Error("Footage name is required"), { status: 400 });
    }
    const ws = readWorkspace();
    const item = {
      id: `ft_${crypto.randomBytes(4).toString("hex")}`,
      name,
      kind: ["video", "audio", "image"].includes(payload.kind) ? payload.kind : "video",
      durationSec: Number.isFinite(Number(payload.durationSec)) ? Math.max(0, Math.round(Number(payload.durationSec))) : 0,
      resolution: String(payload.resolution || "1920×1080").slice(0, 40),
      fps: Number.isFinite(Number(payload.fps)) ? Number(payload.fps) : 30,
      colorProfile: String(payload.colorProfile || "Rec.709").slice(0, 40),
      sizeMB: Number.isFinite(Number(payload.sizeMB)) ? Math.max(0, Math.round(Number(payload.sizeMB) * 10) / 10) : 0,
      filePath: typeof payload.filePath === "string" ? payload.filePath.slice(0, 500) : "",
      brandId: String(payload.brandId || ""),
      projectId: String(payload.projectId || ""),
      tags: Array.isArray(payload.tags) ? payload.tags.map((t) => String(t).trim().slice(0, 32)).filter(Boolean).slice(0, 8) : [],
      createdAt: new Date().toISOString(),
    };
    ws.footage.unshift(item);
    writeWorkspace(ws);
    recordActivity({
      source,
      type: "footage_added",
      title: `Added footage “${item.name}”`,
      detail: `${item.kind} · ${item.resolution}`,
      meta: { footageId: item.id },
    });
    return item;
  }

  function deleteFootage(id, { source = "user" } = {}) {
    const ws = readWorkspace();
    const target = ws.footage.find((f) => f.id === id);
    if (!target) throw Object.assign(new Error(`Footage not found: ${id}`), { status: 404 });
    ws.footage = ws.footage.filter((f) => f.id !== id);
    writeWorkspace(ws);
    recordActivity({
      source,
      type: "footage_deleted",
      title: `Removed footage “${target.name}”`,
    });
    return { ok: true, deleted: target };
  }

  // --- Voice Notes ---
  function listVoiceNotes(filter = {}) {
    const ws = readWorkspace();
    let list = ws.voiceNotes;
    if (filter.brandId) list = list.filter((v) => v.brandId === filter.brandId);
    if (filter.projectId) list = list.filter((v) => v.projectId === filter.projectId);
    return [...list].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  }

  function createVoiceNote(payload, { source = "user" } = {}) {
    const ws = readWorkspace();
    const id = `vn_${crypto.randomBytes(4).toString("hex")}`;
    let audioFile = "";
    let mimeType = "";
    let hasAudio = false;

    if (typeof payload?.audioBase64 === "string" && payload.audioBase64.trim()) {
      const match = /^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/i.exec(payload.audioBase64.trim());
      if (!match) {
        throw Object.assign(new Error("Invalid audio data URL"), { status: 400 });
      }
      const buf = Buffer.from(match[2], "base64");
      if (buf.length > 25 * 1024 * 1024) {
        throw Object.assign(new Error("Audio recording exceeds 25 MB limit"), { status: 413 });
      }
      mimeType = match[1].toLowerCase();
      const ext = mimeType.includes("wav") ? ".wav" : mimeType.includes("ogg") ? ".ogg" : mimeType.includes("mp4") ? ".m4a" : ".webm";
      audioFile = `${id}${ext}`;
      fs.mkdirSync(paths.voiceDir, { recursive: true });
      fs.writeFileSync(path.join(paths.voiceDir, audioFile), buf);
      hasAudio = true;
    }

    const title = String(payload?.title ?? "").trim().slice(0, 140) || `Voice note · ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    const transcript = String(payload?.transcript ?? "").trim().slice(0, 4000);
    if (!hasAudio && !transcript) {
      throw Object.assign(new Error("Provide recorded audio or a voice note transcript"), { status: 400 });
    }

    const note = {
      id,
      title,
      transcript,
      durationSec: Number.isFinite(Number(payload?.durationSec)) ? Math.max(0, Math.round(Number(payload.durationSec))) : 0,
      brandId: String(payload?.brandId || ""),
      projectId: String(payload?.projectId || ""),
      hasAudio,
      audioFile,
      mimeType,
      createdAt: new Date().toISOString(),
    };
    ws.voiceNotes.unshift(note);
    writeWorkspace(ws);
    recordActivity({
      source,
      type: "voice_note",
      title: `Saved voice note “${note.title}”`,
      detail: note.transcript ? note.transcript.slice(0, 90) : `${note.durationSec}s audio`,
      meta: { voiceNoteId: note.id },
    });
    return note;
  }

  function getVoiceNoteAudioPath(id) {
    const note = listVoiceNotes().find((v) => v.id === id);
    if (!note || !note.hasAudio || !note.audioFile) return null;
    const full = path.join(paths.voiceDir, path.basename(note.audioFile));
    return fs.existsSync(full) ? { filePath: full, mimeType: note.mimeType || "audio/webm" } : null;
  }

  function deleteVoiceNote(id, { source = "user" } = {}) {
    const ws = readWorkspace();
    const target = ws.voiceNotes.find((v) => v.id === id);
    if (!target) throw Object.assign(new Error(`Voice note not found: ${id}`), { status: 404 });
    ws.voiceNotes = ws.voiceNotes.filter((v) => v.id !== id);
    writeWorkspace(ws);
    if (target.audioFile) {
      try {
        fs.rmSync(path.join(paths.voiceDir, path.basename(target.audioFile)), { force: true });
      } catch {
        // ignore
      }
    }
    recordActivity({
      source,
      type: "voice_note_deleted",
      title: `Deleted voice note “${target.title}”`,
    });
    return { ok: true, deleted: target };
  }

  // --- Unified Search ---
  function searchWorkspace(rawQuery) {
    const query = String(rawQuery || "").trim();
    const q = query.toLowerCase();
    const brands = listBrands();
    const projects = listProjects();
    const footage = listFootage();
    const voiceNotes = listVoiceNotes();

    if (!q) {
      return { query, brands, projects, footage, voiceNotes, total: brands.length + projects.length + footage.length + voiceNotes.length };
    }

    const hit = (...fields) => fields.some((f) => String(f || "").toLowerCase().includes(q));
    const matchedBrands = brands.filter((b) => hit(b.name, b.tagline, b.audience, b.voice, b.channels, b.notes, ...(b.colors || [])));
    const matchedProjects = projects.filter((p) => {
      const brand = brands.find((b) => b.id === p.brandId);
      return hit(p.name, p.folder, p.summary, p.notes, p.status, brand?.name);
    });
    const matchedFootage = footage.filter((f) => hit(f.name, f.kind, f.colorProfile, f.resolution, ...(f.tags || [])));
    const matchedVoiceNotes = voiceNotes.filter((v) => hit(v.title, v.transcript));

    return {
      query,
      brands: matchedBrands,
      projects: matchedProjects,
      footage: matchedFootage,
      voiceNotes: matchedVoiceNotes,
      total: matchedBrands.length + matchedProjects.length + matchedFootage.length + matchedVoiceNotes.length,
    };
  }

  function buildBrandGuidelines(idOrName) {
    const brand = getBrand(idOrName);
    if (!brand) return null;
    const projects = listProjects({ brandId: brand.id });
    const voiceNotes = listVoiceNotes({ brandId: brand.id });
    const footage = listFootage({ brandId: brand.id });
    return {
      brand: { ...brand, hasLogo: Boolean(brand.logo), logo: undefined },
      summary: [
        `Brand: ${brand.name}`,
        brand.tagline ? `Tagline: ${brand.tagline}` : null,
        brand.colors.length ? `Palette: ${brand.colors.join(", ")}` : null,
        brand.audience ? `Target Audience: ${brand.audience}` : null,
        brand.voice ? `Voice & Tone: ${brand.voice}` : null,
        brand.channels ? `Channels: ${brand.channels}` : null,
        brand.notes ? `Creative Guidelines: ${brand.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      relatedCounts: {
        projects: projects.length,
        footage: footage.length,
        voiceNotes: voiceNotes.length,
      },
      recentProjects: projects.slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        aspect: p.aspect,
        notes: p.notes,
      })),
      recentVoiceNotes: voiceNotes.slice(0, 5).map((v) => ({
        id: v.id,
        title: v.title,
        transcript: v.transcript,
      })),
    };
  }

  function writeServerInfo(info) {
    atomicWriteJson(paths.serverInfoFile, {
      ...info,
      pid: process.pid,
      updatedAt: new Date().toISOString(),
    });
  }

  function readServerInfo() {
    return safeReadJson(paths.serverInfoFile, null);
  }

  return {
    paths,
    readPrefs,
    writePrefs,
    listBrands,
    getBrand,
    createBrand,
    createExampleBrand,
    updateBrand,
    deleteBrand,
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    listFootage,
    addFootage,
    deleteFootage,
    listVoiceNotes,
    createVoiceNote,
    getVoiceNoteAudioPath,
    deleteVoiceNote,
    listActivity,
    recordActivity,
    searchWorkspace,
    buildBrandGuidelines,
    resetWorkspace,
    writeServerInfo,
    readServerInfo,
  };
}
