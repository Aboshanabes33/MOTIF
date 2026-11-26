/**
 * MOTIF Release Catalog + Local Built Windows Artifacts + GitHub Releases live sync.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const GITHUB_REPO = "Aboshanabes33/MOTIF";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedGithubReleases = null;
let cachedAt = 0;

export const CURRENT_RELEASE = {
  version: "2.0.0",
  tag: "v2.0.0",
  name: "MOTIF 2.0 — Liquid Glass Desktop & MCP Agent Hub",
  publishedAt: "2026-11-26T20:00:00Z",
  channel: "stable",
  prerelease: false,
  platform: "Windows 10 / 11 (x64)",
  electronVersion: "35.2.0",
  reactVersion: "19.1.0",
  mcpProtocol: "2025-03-26",
  releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/v2.0.0`,
  highlights: [
    "Complete React 19 + TypeScript desktop rebuild faithful to the MOTIF Liquid Glass Design Spec",
    "Built-in Model Context Protocol (MCP) server with 22 tools, 18 resources & 4 prompts for Claude, Cursor, and Codex — including the video-edit agent stack, installed into your agent with one click",
    "AI agents can inspect and edit saved Brands (colors, logo, audience, tone of voice, channels, notes), Projects, Footage, and Voice Notes in real time",
    "Self-contained Windows x64 Portable executable (.exe) with official MOTIF icon, bundled Node.js 24 LTS runtime, and zero external prerequisites",
    "Full Arabic (RTL) and English (LTR) interface with keyboard shortcuts (1–6, /, Escape)",
    "Local Windows packaging via `npm run build:win-exe` (standalone portable .exe) and `npm run dist:win` (Electron NSIS installer)",
  ],
  highlightsAr: [
    "إعادة بناء كاملة لتطبيق MOTIF باستخدام React 19 وTypeScript وفق تصميم Liquid Glass",
    "خادم MCP مدمج يضم ١٦ أداة و٥ موارد لربط Claude وCursor وCodex بالتطبيق مباشرة",
    "تمكين الوكيل الذكي من رؤية وتعديل البراندات (الألوان، الشعار، الجمهور، نبرة الصوت، القنوات) والمشاريع والملاحظات الصوتية لحظياً",
    "ملف Windows x64 تنفيذي مستقل (.exe) بأيقونة MOTIF الرسمية وبيئة Node.js 24 مدمجة دون أي متطلبات مسبقة",
    "دعم كامل للغتين العربية (RTL) والإنجليزية (LTR) مع اختصارات لوحة المفاتيح",
    "بناء مباشر لنسخة ويندوز المحمولة عبر `npm run build:win-exe` ومثبّت Electron عبر `npm run dist:win`",
  ],
  artifacts: [
    {
      id: "win-portable",
      label: "Windows Portable App (.exe)",
      labelAr: "تطبيق ويندوز المحمول (.exe)",
      fileName: "MOTIF-Portable-2.0.0-x64.exe",
      arch: "x64",
      kind: "portable",
      recommended: true,
      url: `https://github.com/${GITHUB_REPO}/releases/tag/v2.0.0`,
      note: "Standalone single-file Windows 10/11 x64 executable with bundled Node.js 24 LTS, MOTIF icon, React Studio, and MCP server — double-click and run immediately.",
    },
    {
      id: "win-nsis",
      label: "Windows Electron Installer (NSIS Setup)",
      labelAr: "مثبّت ويندوز Electron (NSIS Setup)",
      fileName: "MOTIF-Setup-2.0.0-x64.exe",
      arch: "x64",
      kind: "installer",
      recommended: false,
      url: `https://github.com/${GITHUB_REPO}/releases/tag/v2.0.0`,
      note: "Full Electron NSIS installer built locally via `npm run dist:win` (Start Menu & Desktop shortcuts).",
    },
  ],
  requirements: {
    os: "Windows 10 (1903+) or Windows 11, 64-bit (x64)",
    cpu: "4-core x64 processor or newer",
    ram: "8 GB RAM minimum (16 GB recommended for 4K video)",
    disk: "200 MB free space for app (+ project media storage)",
    mcp: "Bundled Node.js 24 LTS included inside the portable .exe for Claude Desktop / Cursor / Codex MCP",
  },
};

export const FALLBACK_GITHUB_RELEASES = [
  {
    id: "v2.0.0",
    tag: "v2.0.0",
    name: "MOTIF v2.0.0 — Windows x64 (React + Liquid Glass + MCP)",
    publishedAt: "2026-11-26T20:00:00Z",
    prerelease: false,
    url: `https://github.com/${GITHUB_REPO}/releases/tag/v2.0.0`,
    summary: "Complete React 19 + Liquid Glass desktop rebuild with built-in 16-tool MCP server and Windows x64 executable packaging.",
    assets: [],
    sha256: "",
  },
];

function extractSha256(body) {
  if (typeof body !== "string") return "";
  const m = /SHA[- ]?256[:\s`]*([0-9a-f]{64})/i.exec(body);
  return m ? m[1].toLowerCase() : "";
}

function readLocalChecksumMap(releaseDir) {
  const map = new Map();
  const sumsPath = path.join(releaseDir, "SHA256SUMS.txt");
  if (fs.existsSync(sumsPath)) {
    try {
      const lines = fs.readFileSync(sumsPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const m = /^([0-9a-f]{64})\s+(.+)$/i.exec(line.trim());
        if (m) map.set(m[2].trim(), m[1].toLowerCase());
      }
    } catch {
      // ignore
    }
  }
  return map;
}

function enrichCurrentReleaseWithLocalBuilds(releaseDir) {
  const checksumMap = readLocalChecksumMap(releaseDir);
  const artifacts = CURRENT_RELEASE.artifacts.map((art) => {
    const localPath = path.join(releaseDir, art.fileName);
    if (fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      if (stat.isFile()) {
        let sha256 = checksumMap.get(art.fileName) || "";
        if (!sha256) {
          sha256 = crypto.createHash("sha256").update(fs.readFileSync(localPath)).digest("hex");
        }
        return {
          ...art,
          url: `/downloads/${encodeURIComponent(art.fileName)}`,
          directDownload: true,
          ready: true,
          size: stat.size,
          sha256,
        };
      }
    }
    return { ...art };
  });

  const hasLocalSums = fs.existsSync(path.join(releaseDir, "SHA256SUMS.txt"));
  return {
    ...CURRENT_RELEASE,
    artifacts,
    checksumsUrl: hasLocalSums ? "/downloads/SHA256SUMS.txt" : undefined,
  };
}

export async function fetchReleasesPayload(opts = {}) {
  const releaseDir = opts.releaseDir || path.join(REPO_ROOT, "release");
  const current = enrichCurrentReleaseWithLocalBuilds(releaseDir);

  const now = Date.now();
  if (cachedGithubReleases && now - cachedAt < CACHE_TTL_MS) {
    return {
      repo: GITHUB_REPO,
      current,
      githubReleases: cachedGithubReleases,
      syncedFromGithub: true,
    };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "MOTIF-Desktop/2.0.0",
      },
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        cachedGithubReleases = list.map((rel) => ({
          id: String(rel.id || rel.tag_name),
          tag: String(rel.tag_name || ""),
          name: String(rel.name || rel.tag_name || ""),
          publishedAt: String(rel.published_at || rel.created_at || ""),
          prerelease: Boolean(rel.prerelease),
          url: String(rel.html_url || `https://github.com/${GITHUB_REPO}/releases`),
          summary: String(rel.body || "")
            .split(/\r?\n/)
            .filter((l) => l.trim() && !l.startsWith("#"))
            .slice(0, 2)
            .join(" ")
            .slice(0, 280),
          sha256: extractSha256(rel.body),
          assets: Array.isArray(rel.assets)
            ? rel.assets.map((a) => ({
                name: String(a.name || ""),
                size: Number(a.size || 0),
                downloadCount: Number(a.download_count || 0),
                downloadUrl: String(a.browser_download_url || ""),
              }))
            : [],
        }));
        cachedAt = now;
        return {
          repo: GITHUB_REPO,
          current,
          githubReleases: cachedGithubReleases,
          syncedFromGithub: true,
        };
      }
    }
  } catch {
    // offline or rate limited -> fallback cleanly
  }

  return {
    repo: GITHUB_REPO,
    current,
    githubReleases: FALLBACK_GITHUB_RELEASES,
    syncedFromGithub: false,
  };
}
