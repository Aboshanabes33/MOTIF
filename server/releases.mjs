/**
 * MOTIF Release Catalog + GitHub Releases live sync (with offline fallback).
 */

const GITHUB_REPO = "Aboshanabes33/MOTIF";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedGithubReleases = null;
let cachedAt = 0;

export const CURRENT_RELEASE = {
  version: "2.0.0",
  tag: "v2.0.0",
  name: "MOTIF 2.0 — Liquid Glass Desktop & MCP Agent Hub",
  publishedAt: "2026-11-26T18:00:00Z",
  channel: "stable",
  prerelease: false,
  platform: "Windows 10 / 11 (x64)",
  electronVersion: "35.2.0",
  reactVersion: "19.1.0",
  mcpProtocol: "2025-03-26",
  releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
  highlights: [
    "Complete React 19 + TypeScript desktop rebuild faithful to the MOTIF Liquid Glass Design Spec",
    "Built-in Model Context Protocol (MCP) server with 16 tools, 5 resources & 2 prompts for Claude, Cursor, and Codex",
    "AI agents can inspect and edit saved Brands (colors, logo, audience, tone of voice, channels, notes), Projects, Footage, and Voice Notes in real time",
    "Frameless Windows Electron shell with native window controls, embedded local server, and custom MOTIF icon",
    "Full Arabic (RTL) and English (LTR) interface with keyboard shortcuts (1–6, /, Escape)",
    "Dedicated Windows NSIS Installer (.exe) & Portable (.exe) packaging via electron-builder + GitHub Actions",
  ],
  highlightsAr: [
    "إعادة بناء كاملة لتطبيق MOTIF باستخدام React 19 وTypeScript وفق تصميم Liquid Glass",
    "خادم MCP مدمج يضم ١٦ أداة و٥ موارد لربط Claude وCursor وCodex بالتطبيق مباشرة",
    "تمكين الوكيل الذكي من رؤية وتعديل البراندات (الألوان، الشعار، الجمهور، نبرة الصوت، القنوات) والمشاريع والملاحظات الصوتية لحظياً",
    "تغليف Electron لنظام ويندوز بإطار مخصص وخادم محلي مدمج وأيقونة MOTIF الرسمية",
    "دعم كامل للغتين العربية (RTL) والإنجليزية (LTR) مع اختصارات لوحة المفاتيح",
    "حزمة تثبيت Windows Installer (.exe) ونسخة محمولة Portable (.exe) مع أتمتة الإصدارات عبر GitHub Actions",
  ],
  artifacts: [
    {
      id: "win-nsis",
      label: "Windows Installer (NSIS Setup)",
      labelAr: "مثبّت ويندوز (NSIS Setup)",
      fileName: "MOTIF-Setup-2.0.0-x64.exe",
      arch: "x64",
      kind: "installer",
      recommended: true,
      url: `https://github.com/${GITHUB_REPO}/releases/latest`,
      note: "Recommended for Windows 10/11 — Start Menu shortcut, auto-registers local data folder & bundled MCP server.",
    },
    {
      id: "win-portable",
      label: "Windows Portable Executable",
      labelAr: "نسخة ويندوز المحمولة (Portable)",
      fileName: "MOTIF-Portable-2.0.0-x64.exe",
      arch: "x64",
      kind: "portable",
      recommended: false,
      url: `https://github.com/${GITHUB_REPO}/releases/latest`,
      note: "Single standalone executable with no installation wizard required.",
    },
  ],
  requirements: {
    os: "Windows 10 (1903+) or Windows 11, 64-bit (x64)",
    cpu: "4-core x64 processor or newer",
    ram: "8 GB RAM minimum (16 GB recommended for 4K video)",
    disk: "500 MB free space for app (+ project media storage)",
    mcp: "Node.js 20+ (or bundled Electron runtime) for Claude Desktop / Cursor / Codex MCP",
  },
};

export const FALLBACK_GITHUB_RELEASES = [
  {
    id: "v0.1.2-lite-test",
    tag: "v0.1.2-lite-test",
    name: "MOTIF 0.1.2 Lite test, Groq plus bundled FFmpeg",
    publishedAt: "2026-11-26T12:51:03Z",
    prerelease: true,
    url: `https://github.com/${GITHUB_REPO}/releases/tag/v0.1.2-lite-test`,
    summary: "Windows x64 portable pre-release with Groq Whisper transcription, bundled FFmpeg, SVG icons, and Brand color picker.",
    assets: [
      {
        name: "MOTIF-0.1.2-lite-test-x64.exe",
        size: 149420354,
        downloadUrl: `https://github.com/${GITHUB_REPO}/releases/download/v0.1.2-lite-test/MOTIF-0.1.2-lite-test-x64.exe`,
      },
    ],
    sha256: "8e9cd7020bc763e86ff009de1f795f7b0681be877a2482344f6491114f087bae",
  },
  {
    id: "v0.1.0",
    tag: "v0.1.0",
    name: "MOTIF 0.1.0, bundled Windows x64",
    publishedAt: "2026-11-25T17:30:22Z",
    prerelease: false,
    url: `https://github.com/${GITHUB_REPO}/releases/tag/v0.1.0`,
    summary: "Self-extracting Windows x64 bundle with FFmpeg, static whisper.cpp + large-v3-q5_0 model, Node, and HyperFrames.",
    assets: [
      {
        name: "MOTIF-0.1.0-bundled-x64.exe",
        size: 1419558058,
        downloadUrl: `https://github.com/${GITHUB_REPO}/releases/download/v0.1.0/MOTIF-0.1.0-bundled-x64.exe`,
      },
    ],
    sha256: "8cdd4a0d5f69d58109f8285ec35ef291accc412885d01797dada4904ddd1222c",
  },
];

function extractSha256(body) {
  if (typeof body !== "string") return "";
  const m = /SHA256[:\s`]*([0-9a-f]{64})/i.exec(body);
  return m ? m[1].toLowerCase() : "";
}

export async function fetchReleasesPayload() {
  const now = Date.now();
  if (cachedGithubReleases && now - cachedAt < CACHE_TTL_MS) {
    return {
      repo: GITHUB_REPO,
      current: CURRENT_RELEASE,
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
          summary: String(rel.body || "").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).slice(0, 2).join(" ").slice(0, 280),
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
          current: CURRENT_RELEASE,
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
    current: CURRENT_RELEASE,
    githubReleases: FALLBACK_GITHUB_RELEASES,
    syncedFromGithub: false,
  };
}
