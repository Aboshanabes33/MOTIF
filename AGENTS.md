<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

# MOTIF: project rules for coding agents

Everything from this heading down is the project's own. The part above is managed by Lovable:
never edit between the `LOVABLE:BEGIN` and `LOVABLE:END` markers.

MOTIF is an AI creative-workflow app for video editors, motion designers and marketers: teach it
a brand or style once, and every AI-assisted edit follows it without re-sending references or
prompts. This repository holds a working demo. The job is to evolve that demo into the
production application defined in `product-brif.md`. It is an engineering task, not a redesign.

## Read first

- `product-brif.md` (the brief) is the source of truth for the target architecture, the phases
  and the working rules. Read it in full before planning or architectural work. This file adds
  what the brief cannot know: the real state of the repository, and where the two disagree.
- The existing UI under `src/` is the source of truth for visual design and user experience.
- `motif-ai-video-editing-app-no-login-no-saving-2026-11-14.md` is the plan the demo was
  generated from. It is historical: where it differs from the code, trust the code.
- An explicit instruction from the owner in the current task overrides these project rules. If
  following it would break one of Lovable's rules above, say so before you act.

## Status

Phase 1 of 6, the repository audit. Its deliverable is a written audit and plan, not code
(brief §14). It has not been delivered or approved, and phases 2 to 6 (backend foundation, agent
foundation, creative intelligence, media pipeline, production readiness) have not started.

Until the owner approves the plan, do not restructure the repository, add a backend, auth, a
database or an agent runtime, or install the packages those would need. Four questions are also
waiting on the owner: see "Open decisions".

## Rules that always apply

Condensed from the brief.

1. Inspect before you modify: read the code you are changing, and its callers, first.
2. Preserve the UI: no redesign, no restyling, no product features beyond the brief.
3. Do not replace working code without a stated technical reason. Migrate one phase at a time.
4. Keep backend logic out of React components. Keep the agent runtime, AI providers and media
   tools behind MOTIF-owned interfaces, so each can be replaced without touching the rest.
5. Stay web-first. Draw boundaries a future Electron app could reuse; do not build Electron.
6. Add no infrastructure cost (a VPS, cloud media processing) without written justification and
   the owner's approval.
7. Add a dependency only in the phase that uses it, after checking that its license permits
   commercial use. Record the license in `docs/licenses.md` (brief §12).
8. "The UI renders" is not done. New auth, ownership, provider, agent, tool-validation, media
   and API-error code ships with tests that use small, realistic fixtures (brief §11).
9. End each phase by running the checks under "Commands" and reporting what was completed, what
   failed and what is blocked.
10. Put long-form output (the audit, plans, decision records, the license inventory) in `docs/`.

## Target architecture

Decided by the brief (§3 to §8), which holds the details. Apart from the frontend base, none of
it exists yet.

- **Frontend:** the existing React, Vite, TypeScript and Tailwind app, with Zustand for client
  state, TanStack Query for server state and Zod for validation.
- **Backend:** Node.js with Hono (`@hono/node-server`), handling auth verification,
  authorization, agent sessions, AI provider integrations, streaming and project operations.
- **Identity and data:** Whop for identity and membership, verified server-side. Supabase
  PostgreSQL for `profiles`, `brands`, `projects`, `user_preferences` and `onboarding_progress`,
  changed only through migrations.
- **Agent:** the Pi SDK (`@earendil-works/pi-coding-agent`) on the server, behind a MOTIF agent
  abstraction, using each user's own provider credentials (OAuth or API key).
- **Media:** FFmpeg (transcoding, probing), Mediabunny (in-browser media), whisper.cpp
  (transcription) and HyperFrames (rendering), behind a dedicated media service interface.
- **MOTIF Core:** brand intelligence, reference analysis, project management and validated
  creative agent tools.

## The code today

Verified on 2026-11-14.

- **Stack:** TanStack Start (React 19, Vite 8, server-side rendering) through the Lovable preset
  `@lovable.dev/vite-tanstack-config`, strict TypeScript, Tailwind CSS v4, shadcn/ui.
- **Routes** (`src/routes/`): `/` new session, `/session/$id` chat, `/session/$id/edit`
  timeline editor, `/styles` style library.
- **UI:** in `src/components/`, `Shell.tsx` (app shell, sidebar, style panel), `Composer.tsx` and
  `ResultCard.tsx`. Of the 46 shadcn components in `src/components/ui/`, only `dropdown-menu`
  and `sonner` are used; reuse the rest before adding a UI dependency.
- **State:** one React context store, `src/lib/store.tsx`, seeded with sample data. It lives in
  memory and resets on refresh. There is no auth, database or persistence, and attached media
  is never uploaded: only its file name is used.
- **Server:** two server functions in `src/lib/ai.functions.ts`, `chatEdit` and `extractStyle`.
  Each makes one non-streaming call to the Lovable AI Gateway, which needs `LOVABLE_API_KEY` in
  the server environment. Results, thumbnails and timelines are mock visuals; no video is
  rendered or exported.
- **Deployment:** Nitro preset `cloudflare-module` (Cloudflare Workers).
- **Missing:** there is no Supabase client or migration, no `.env` file and no CI. Zod is
  installed but never imported, and TanStack Query is wired up but runs no queries.

## Open decisions

Only the owner can settle these. Do not pick a side or start work that depends on an answer;
raise the question instead. When one is settled, delete it here and record it in
`docs/decisions.md`.

1. **Lovable or the brief.** Lovable's rules above forbid hand-written `supabase/migrations/`
   and require model calls to stay on Lovable's gateway, and Lovable builds deploy to Cloudflare
   Workers. The brief requires migrations in the repository, the Pi SDK with each user's own
   provider credentials, and a Node.js backend. No single change can satisfy both. Does MOTIF
   stay on Lovable and accept those limits, move off it, or keep only the web app there?
2. **Where the backend runs.** The Pi SDK needs a long-running Node.js (22.19 or later) or Bun
   process, and server-side FFmpeg and whisper.cpp are native programs. Cloudflare Workers can
   run none of them, and a server host is a new cost that brief §13 allows only with explicit
   justification.
3. **Repository layout and package manager.** Today there is one app, with `package-lock.json`
   and `bun.lock` both committed. The brief suggests `apps/` and `packages/` on pnpm workspaces
   if a monorepo is justified. Do not move files or introduce pnpm before that is approved.
4. **Vocabulary.** The demo models a `Style` and a `Session`; the brief models brand profiles,
   projects and agent sessions. Agree the mapping before designing a schema or renaming UI.

## Commands

```sh
npm ci             # install from package-lock.json
npm run dev        # dev server at http://localhost:8080
npm run build      # production build into .output/
npm test           # Vitest, single run
npx tsc --noEmit   # typecheck; there is no npm script for it
npm run lint       # ESLint, with Prettier as a rule
```

Baseline on 2026-11-14 with Node.js 22: the build and the tests pass (one routing smoke test).
The typecheck fails with 1 error (`src/routes/styles.tsx:25`, TS7030). Lint fails with 229
`prettier/prettier` formatting errors and 9 warnings.

- Before reporting a code change as finished, run the tests, the typecheck and the build. Add no
  new failures, report against this baseline, and never call a failing run clean.
- Do not run `npm run format` as part of other work: it rewrites every file, including
  Lovable's part of this one. New files must pass `npx eslint <file>`. In a file that already
  fails formatting, keep the diff minimal. Clearing the baseline is its own formatting-only
  commit, needs the owner's go-ahead, and must leave this file untouched.
- A dependency change must update both lockfiles: the Lovable template is set up for Bun, and
  `bunfig.toml` refuses package versions published in the last 24 hours. If you cannot run Bun,
  say so in your report.

## Conventions

- TypeScript is `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  Import from `src/` through the `@/` alias. Prettier: 100 columns, double quotes, semicolons.
- Never hand-edit generated files: `src/routeTree.gen.ts` and `src/generated/ai-gateway/*`.
- Before editing `vite.config.ts`, `src/styles.css` or `src/start.ts`, read the comments in that
  file; before adding a route, read `src/routes/README.md`. They state constraints that break
  the build, or remove CSRF protection, when ignored.
- Style with the semantic Tailwind tokens defined in `src/styles.css` (`bg-background`,
  `text-brand-yellow`, `bg-track-video`), not raw colors. The theme is dark only.
- Server functions use `createServerFn` in `*.functions.ts`; server-only modules are named
  `*.server.ts`.

## Security

Brief §5 and §9 are binding. In this codebase that means:

- Secrets (provider keys, OAuth tokens, the Supabase service-role key, Whop credentials,
  `LOVABLE_API_KEY`) exist only in the server environment: never in the repository, a log, an
  error message, or a `VITE_`-prefixed variable, which the build injects into the browser bundle.
- Every server entry point validates input with a Zod schema, checks that the caller owns the
  data, and validates model output before using it.
- Never trust a path or URL from a user or a model. Keep file operations inside the authorized
  project directory. A server-side fetch of a user URL needs a scheme allowlist, a block on
  private addresses, a timeout and a size cap.
- Agent tools never run arbitrary shell commands. Start FFmpeg and whisper.cpp with a fixed
  binary and an argument array, with a timeout and cancellation.
- Isolate provider credentials and agent sessions per user, and encrypt credentials at rest.
- Never send a user's brand documents or media to an external AI provider without their
  informed consent. Ask for confirmation before a destructive operation or an overwriting export.
- Rate-limit expensive operations (AI calls, media processing).

Known gaps in the demo, to close when the backend is built and never to copy: the AI server
functions have no auth or rate limit, their validators are identity casts, model output is
parsed without a schema, `extractStyle` fetches any URL without a timeout, size cap or address
filter, and user text is interpolated straight into prompts.

## Git

- Never rewrite pushed history. `main` syncs to Lovable, so it must always build and pass tests.
- Keep commits small and single-purpose; never mix formatting with behavior changes.

## Maintaining this file

- Update "Status", "Open decisions", "The code today" and the baseline in the same change that
  makes them stale. Keep the file short; detail belongs in `product-brif.md` or `docs/`.
- Write scoped package names in backticks: `CLAUDE.md` imports this file, and Claude Code reads
  a bare `@path` as a file to import.
