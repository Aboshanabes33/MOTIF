# AGENT.md

## Repository

MOTIF is a proprietary, local-first desktop studio application built with React 19 + TypeScript (`src/`), a shared Node.js HTTP/SSE server (`server/`), an MCP stdio server (`mcp/`), and Electron (`electron/`). Do not publish or redistribute proprietary implementation details.

## Working conventions

- Prefer existing browser modules, helpers and server route patterns.
- Keep user-facing copy available in Arabic and English.
- Use `/api/prefs` for small desktop-wide settings and `project.json` for project-specific state.
- Never store secrets or API keys in browser settings or source files.
- Preserve existing keyboard, dialog, focus, RTL and breakpoint behavior.
- Make compact, focused changes; do not reformat unrelated generated or minified files.

## Video agent stack (`video-edit/`)

The local video-editing agent runs on exactly one stack, and this folder is it:

- `video-edit/SKILL.md` — the instruction set the agent executes (read it before touching a clip).
- `video-edit/stack.json` — the machine-readable manifest: data home, modes (`quick` · `light` · `full`), 17 stages with the exact commands and validators, frames, styles, references, exit codes and red lines. Keep it in sync with `SKILL.md`; never duplicate the prose.
- `video-edit/references/` + `video-edit/styles/` — the docs each stage reads; `video-edit/scripts/` — the only tools the pipeline runs (ffmpeg, faster-whisper/mlx-whisper, face guard, Remotion template).
- `server/video-agent.mjs` — reads the manifest, resolves the editing home (`VEB_HOME` → `~/Documents/video-edit`, or `C:\EditStudio` on risky Windows paths), lists clips with their real artifacts, builds stage plans, and runs whitelisted steps with the `exit 3 = refused` gate.
- Exposed as MCP tools `video_edit_status|plan|stage|run`, resources `motif://video/stack` and `motif://video/projects`, prompt `video_agent`, HTTP `/api/video/edit/*`, and the **Video Agent** view (`5`).

Rules for this folder: the skill folder is read-only at runtime, all user data lives in the editing home, and the agent never bypasses a red line because a brand or UI asks it to.

## Brand feature

Brand profiles are global desktop preferences stored in `prefs.json` under the `brands` array.

Each brand has:

- `id`
- `name`
- `tagline`
- `logo` (small data URL)
- `colors` (up to four hex values)
- `audience`
- `voice`
- `channels`
- `notes`

Brand logos must be images no larger than 2 MB. The Library UI is the entry point for creating and editing brands.

## Validation

Before finishing a change, run the relevant checks:

```bash
npm run build
npm test
```
