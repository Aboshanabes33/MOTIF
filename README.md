# MOTIF Desktop (React + MCP + Electron)

تطبيق **MOTIF** لسطح المكتب مُعاد بناؤه باستخدام **React 19 + TypeScript** بتصميم **Liquid Glass** (وفق `DESIGN.md`)، مع خادم **MCP (Model Context Protocol)** مدمج يتيح لوكلاء الذكاء الاصطناعي (Claude وCursor وCodex) قراءة وإدارة البراندات والمشاريع واللقطات والملاحظات الصوتية مباشرة، ومُغلَّف بـ **Electron** للتثبيت على نظام **Windows (x64)** مع صفحة إصدارات مخصصة.

**MOTIF Desktop** rebuilt in **React 19 + TypeScript** following the MOTIF Liquid Glass Design Spec (`DESIGN.md`), featuring a built-in **Model Context Protocol (MCP)** server so AI agents (Claude, Cursor, Codex) can read and manage saved **Brands**, **Projects**, **Footage**, and **Voice Notes** in real time, packaged in **Electron** for Windows x64 download, with a dedicated **Releases Page**.

---

## المزايا الرئيسية · Key Features

1. **React 19 + Liquid Glass UI (`src/`)**
   - Custom 44px frameless title bar (`MOTIF` display serif wordmark, drag region, native Windows controls).
   - Deep teal atmospheric canvas with 3-layer organic mountain silhouettes (`MountainBackdrop`), unified Liquid Glass strictly on controls (Sidebar, Segmented control, Search pill, `+ New`, Reply chip, Record button, Modals), and solid dark content cards & Inspector.
   - Views: **Today (`1`)**, **Brands (`2`)**, **Voice note (`3`)**, **Search (`4` / `/`)**, **MCP Agent Hub (`5`)**, and **Releases (`6`)**.
   - Full **Arabic (RTL)** and **English (LTR)** support with responsive breakpoints (`1080px`, `900px`, `640px`).

2. **MCP Server for AI Agents (`mcp/motif-mcp.mjs`)**
   - Standard JSON-RPC 2.0 stdio MCP server (`protocolVersion: 2025-03-26`).
   - **16 Tools**: `motif_status`, `list_brands`, `get_brand`, `get_brand_guidelines`, `create_brand`, `update_brand`, `delete_brand`, `list_projects`, `get_project`, `create_project`, `update_project`, `list_footage`, `add_footage`, `list_voice_notes`, `create_voice_note`, `search_workspace`.
   - **5+ Resources**: `motif://workspace/summary`, `motif://brands`, `motif://brands/{id}`, `motif://projects`, `motif://footage`, `motif://voice-notes`.
   - **2 Prompts**: `brand_brief`, `workspace_review`.
   - Reads/writes the canonical `prefs.json` (`brands` array) and notifies the running MOTIF app live via SSE.

3. **Electron Windows Packaging (`electron/`, `electron-builder.yml`)**
   - Frameless Electron desktop shell with secure preload IPC (`contextIsolation: true`, `sandbox: true`).
   - Embedded local HTTP + SSE backend (`server/motif-server.mjs`) + unpacked MCP server (`asarUnpack: ["mcp/**", "server/**"]`).
   - Official custom MOTIF Windows icon (`build/icon.ico`).
   - Builds both **Windows NSIS Installer** (`MOTIF-Setup-<ver>-x64.exe`) and **Portable** (`MOTIF-Portable-<ver>-x64.exe`), automated via `.github/workflows/release-windows.yml`.

4. **Release Page (`/releases` & `release-page/index.html`)**
   - Accessible inside the React app (`Releases` view or standalone route `/releases`) and as a zero-build static landing page (`release-page/index.html`).
   - Displays Windows Installer & Portable downloads, live GitHub Releases from `Aboshanabes33/MOTIF`, SHA-256 verification, bilingual changelog, system requirements, and MCP setup config.

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

## بنية المستودع · Repository Layout

- `src/` — React 19 + TypeScript application (`components/`, `views/`, `styles/`, `api/`, `i18n.ts`)
- `server/` — Shared atomic `prefs.json` & workspace store (`store.mjs`), HTTP/SSE server (`motif-server.mjs`), release sync (`releases.mjs`)
- `mcp/` — Model Context Protocol stdio server (`motif-mcp.mjs`) & tool/resource registry (`tools.mjs`)
- `electron/` — Electron main process (`main.mjs`) & preload IPC bridge (`preload.cjs`)
- `build/` — Official MOTIF desktop icons (`icon.ico`, `icon.png`)
- `release-page/` — Standalone static Release & Windows download page (`index.html`)
- `.github/workflows/release-windows.yml` — Automated Windows x64 NSIS + Portable build & GitHub Release publisher
- `src/edit-studio/` — Legacy Edit Studio engine preserved for compatibility (patched with root `PUT /api/prefs`)
- `tests/` — Automated HTTP API and JSON-RPC 2.0 stdio MCP test suites
