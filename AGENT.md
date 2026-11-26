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
