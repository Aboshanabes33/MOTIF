# MOTIF Desktop (React + MCP + Electron)

تطبيق **MOTIF** لسطح المكتب مُعاد بناؤه باستخدام **React 19 + TypeScript** بتصميم **Liquid Glass** (وفق `DESIGN.md`)، مع خادم **MCP (Model Context Protocol)** مدمج يتيح لوكلاء الذكاء الاصطناعي (Claude وCursor وCodex) قراءة وإدارة البراندات والمشاريع واللقطات والملاحظات الصوتية مباشرة، ومُغلَّف بـ **Electron** للتثبيت على نظام **Windows (x64)** مع صفحة إصدارات مخصصة.

**MOTIF Desktop** rebuilt in **React 19 + TypeScript** following the MOTIF Liquid Glass Design Spec (`DESIGN.md`), featuring a built-in **Model Context Protocol (MCP)** server so AI agents (Claude, Cursor, Codex) can read and manage saved **Brands**, **Projects**, **Footage**, and **Voice Notes** in real time, packaged in **Electron** for Windows x64 download, with a dedicated **Releases Page**.

---

## المزايا الرئيسية · Key Features

1. **React 19 + Liquid Glass UI (`src/`)**
   - Custom 44px frameless title bar (`MOTIF` display serif wordmark, drag region, native Windows controls).
   - Deep teal atmospheric canvas with 3-layer organic mountain silhouettes (`MountainBackdrop`), unified Liquid Glass strictly on controls (Sidebar, Segmented control, Search pill, `+ New`, Reply chip, Record button, Modals), and solid dark content cards & Inspector.
   - Views: **Today (`1`)**, **Brands (`2`)**, **Voice note (`3`)**, **Search (`4` / `/`)**, **Video Agent (`5`)**, **MCP Agent Hub (`6`)**, and **Releases (`7`)**.
   - Full **Arabic (RTL)** and **English (LTR)** support with responsive breakpoints (`1080px`, `900px`, `640px`).

2. **Video Agent — the `video-edit` stack (`video-edit/`, `server/video-agent.mjs`, `src/views/VideoAgentView.tsx`)**
   - The local agent runs on one declared stack: **`video-edit/SKILL.md` is the instruction set** and **`video-edit/stack.json` is the machine-readable manifest** (modes, 17 stages, commands, validators, red lines, data home). The same stack is served *inside* MCP, so any external agent reads it instead of guessing.
   - Pipeline: silence cut (`01_cut_plan`) → word-timed transcript (`01b_transcribe`) → Arabic captions (`02_captions`) → cut+zoom (`03_cut_zoom`) → scenes (`Scenes.tsx` + Remotion) → SFX → render → verify (`22_preflight`) → SRT.
   - Three depths (`quick` · `light` · `full`), published as `mode.json` in the clip folder; frames `tall` 9:16 / `wide` 16:9 / `square`.
   - Data home follows the skill rule: `VEB_HOME` → `~/Documents/video-edit` (`C:\EditStudio` on risky Windows paths); identity in `profile.json`, history in `mechanisms.json`/`LEDGER.md`.
   - Exposed over MCP (`video_stack`, `video_stack_doc`, `video_edit_status`, `video_edit_plan`, `video_edit_stage`, `video_edit_run`, `motif://video/{stack,skill,bundle,projects,docs/*}`, prompts `video_agent` + `video_stack_brief`) and in the app as the **Video Agent** view (`5`).

3. **MCP Server for AI Agents (`mcp/motif-mcp.mjs`)**
   - Standard JSON-RPC 2.0 stdio MCP server (`protocolVersion: 2025-03-26`).
   - **22 Tools**: `motif_status`, `list_brands`, `get_brand`, `get_brand_guidelines`, `create_brand`, `update_brand`, `delete_brand`, `list_projects`, `get_project`, `create_project`, `update_project`, `list_footage`, `add_footage`, `list_voice_notes`, `create_voice_note`, `search_workspace`, `video_stack`, `video_stack_doc`, `video_edit_status`, `video_edit_plan`, `video_edit_stage`, `video_edit_run`.
   - **18 base Resources** (+ one per brand): `motif://workspace/summary`, `motif://brands`, `motif://brands/{id}`, `motif://projects`, `motif://footage`, `motif://voice-notes`, `motif://video/stack`, `motif://video/projects`, `motif://video/skill`, `motif://video/bundle`, `motif://video/docs/{onboarding,rules,scenes,sfx,generated-images,light-engine,ideas,simple,collage}`.
   - **4 Prompts**: `brand_brief`, `workspace_review`, `video_agent`, `video_stack_brief`.
   - **One-click "Add MCP"**: the MCP view writes MOTIF into Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, or Codex — backup kept, other servers untouched (`POST /api/mcp/install`, `/api/mcp/uninstall`).
   - Reads/writes the canonical `prefs.json` (`brands` array) and notifies the running MOTIF app live via SSE.

4. **Electron Windows Packaging (`electron/`, `electron-builder.yml`)**
   - Frameless Electron desktop shell with secure preload IPC (`contextIsolation: true`, `sandbox: true`).
   - Embedded local HTTP + SSE backend (`server/motif-server.mjs`) + unpacked MCP server (`asarUnpack: ["mcp/**", "server/**"]`).
   - Official custom MOTIF Windows icon (`build/icon.ico`).
   - Built-in Windows x64 Portable `.exe` builder (`npm run build:win-exe`) & Electron packaging (`npm run dist:win`) with official MOTIF icon (`build/icon.ico`).

5. **Website & Releases Page (`https://getmotif.vercel.app` & `/releases`)**
   - Live website at **[https://getmotif.vercel.app](https://getmotif.vercel.app)** with dedicated Releases page at **[https://getmotif.vercel.app/releases](https://getmotif.vercel.app/releases)**, plus the built-in desktop Releases view (`/releases`) and static fallback (`release-page/index.html`).
   - Displays Windows Portable `.exe` (`MOTIF-Portable-2.0.0-x64.exe`), live GitHub Releases from `Aboshanabes33/MOTIF`, SHA-256 verification, bilingual changelog, MCP setup config, and Waitlist signup.

---

## التشغيل والتطوير · Quick Start

```bash
# Install dependencies
npm install

# Run full web dev environment (Backend API on :8795 + React Vite on :5173)
npm run dev:full

# Run automated tests (HTTP API, prefs.json Brand CRUD, and stdio MCP server)
npm test

# Typecheck and build React production bundle
npm run build

# Run in Electron (desktop window)
npm run electron:dev

# Package Windows x64 Installer (.exe) & Portable (.exe)
npm run dist:win
```

## ربط وكيل الذكاء الاصطناعي · Connect via MCP

Add to Claude Desktop (`claude_desktop_config.json`), Cursor, or `.mcp.json`:

```json
{
  "mcpServers": {
    "motif": {
      "command": "node",
      "args": ["./mcp/motif-mcp.mjs"]
    }
  }
}
```

Or open the **MCP Agent** tab (`5`) inside MOTIF for one-click client configs (Claude Desktop, Claude Code, Cursor, Codex) and a live interactive MCP Tool Explorer.

---

## الخصوصية والتحليلات · Privacy & Analytics

MOTIF does not send analytics or error events until the user opts in from **Settings → Privacy & diagnostics**. Configure providers with environment variables (never paste keys into `prefs.json`):

- `SENTRY_DSN` — optional Sentry error reporting DSN.
- `POSTHOG_PUBLIC_KEY` — optional browser project key.
- `POSTHOG_API_KEY` — optional server-side PostHog key; kept server-side only.
- `POSTHOG_HOST` — optional PostHog host (defaults to `https://us.i.posthog.com`).

Without a provider key, telemetry remains inactive. Settings shows the recent local diagnostics ring buffer and whether each provider is configured.

## بنية المستودع · Repository Layout

- `video-edit/` — the agent's video-editing stack (`SKILL.md` + `stack.json` + `references/` + `scripts/` + `styles/` + Remotion template)
- `server/video-agent.mjs` — stack reader, editing-home resolver, clip plans, gated stage runner
- `server/mcp-install.mjs` — one-click "Add MCP": writes MOTIF into Claude Desktop / Claude Code / Cursor / Windsurf / VS Code / Codex configs (backup kept)
- `src/` — React 19 + TypeScript application (`components/`, `views/`, `styles/`, `api/`, `i18n.ts`)
- `server/` — Shared atomic `prefs.json` & workspace store (`store.mjs`), HTTP/SSE server (`motif-server.mjs`), release sync (`releases.mjs`)
- `mcp/` — Model Context Protocol stdio server (`motif-mcp.mjs`) & tool/resource registry (`tools.mjs`)
- `electron/` — Electron main process (`main.mjs`) & preload IPC bridge (`preload.cjs`)
- `build/` — Official MOTIF desktop icons (`icon.ico`, `icon.png`)
- `release-page/` — Standalone static Release & Windows download page (`index.html`)
- `launcher/` & `scripts/build-win-exe.py` — Self-contained Windows x64 Portable `.exe` builder
- `tests/` — Automated HTTP API and JSON-RPC 2.0 stdio MCP test suites
