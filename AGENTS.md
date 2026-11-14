# MOTIF: project rules for coding agents

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
- `docs/decisions.md` records what the owner has already settled. Do not reopen those questions.
- An explicit instruction from the owner in the current task overrides these project rules.

## Status

Phase 1 of 6, the repository audit. Its deliverable is a written audit and plan, not code
(brief §14). It has not been delivered or approved, and phases 2 to 6 (backend foundation, agent
foundation, creative intelligence, media pipeline, production readiness) have not started.

One piece of phase 3 exists ahead of the plan, at the owner's instruction: linking an AI account
through the Pi SDK. `docs/plans/pi-sdk-account-linking.md` describes it and what it leaves open.

Until the owner approves the plan, do not restructure the repository, add a backend, auth, a
database or the agent runtime (the Pi SDK's `createAgentSession`), or install the packages those
would need. Three questions are also waiting on the owner: see "Open decisions".

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

- **Stack:** TanStack Start (React 19, Vite 8, server-side rendering), strict TypeScript,
  Tailwind CSS v4, shadcn/ui.
- **Routes** (`src/routes/`): `/` new session, `/session/$id` chat, `/session/$id/edit`
  timeline editor, `/styles` style library.
- **UI:** in `src/components/`, `Shell.tsx` (app shell, sidebar, style panel), `Composer.tsx`,
  `ResultCard.tsx` and `AccountLink.tsx` (the account pop-up and its sidebar entry). Of the 46
  shadcn components in `src/components/ui/`, only `button`, `dialog`, `dropdown-menu`, `input`
  and `sonner` are used; reuse the rest before adding a UI dependency.
- **State:** one React context store, `src/lib/store.tsx`, seeded with sample data. It lives in
  memory and resets on refresh. There is no auth, database or persistence, and attached media
  is never uploaded: only its file name is used. The one thing the browser keeps is the token of
  its account link, in local storage.
- **AI features:** two server functions in `src/lib/ai.functions.ts`, `chatEdit` and
  `extractStyle`. Each sends one prompt through `ask()` in `src/lib/ai.server.ts`, which runs it
  on the AI account the calling browser linked. Without a linked account both return an error
  and the UI reopens the pop-up. Results, thumbnails and timelines are mock visuals; no video is
  rendered or exported.
- **Account linking:** when the app opens, a pop-up asks each visitor to link their own AI
  account, with an API key or a provider sign-in. `src/lib/account-link.server.ts` keeps one
  link per browser in the server's memory, so a restart forgets them all, and
  `account-link.functions.ts` serves the pop-up. `src/lib/pi.server.ts` does the provider work
  with the Pi SDK's `ModelRuntime`. The server has no AI credential of its own and reads no
  provider key from its environment.
- **Build target:** a Node.js server (Nitro preset `node-server`), started with
  `node .output/server/index.mjs`. It must stay one long-running Node.js process, version 22.19
  or later: the account links live in its memory. Nothing deploys the app: it has no host and no
  CI.
- **Missing:** there is no Supabase client or migration. Zod is installed but never imported, and
  TanStack Query is wired up but runs no queries.

## Open decisions

Only the owner can settle these. Do not pick a side or start work that depends on an answer;
raise the question instead. When one is settled, delete it here and record it in
`docs/decisions.md`.

1. **Which host runs MOTIF.** The app needs one long-running Node.js process (settled on
   2026-11-14, see `docs/decisions.md`), and server-side FFmpeg and whisper.cpp are native
   programs. It has no host yet, and a server host is a new cost that brief §13 allows only with
   explicit justification.
2. **Repository layout and package manager.** Today there is one app, with `package-lock.json`
   and `bun.lock` both committed; the two pin about 190 packages at different versions. The
   brief suggests `apps/` and `packages/` on pnpm workspaces if a monorepo is justified. Do not
   move files or introduce pnpm before that is approved.
3. **Vocabulary.** The demo models a `Style` and a `Session`; the brief models brand profiles,
   projects and agent sessions. Agree the mapping before designing a schema or renaming UI.

## Commands

```sh
npm ci             # install from package-lock.json
npm run dev        # dev server at http://localhost:8080; add `-- --host` to expose it
npm run build      # production build into .output/
npm test           # Vitest, single run
npx tsc --noEmit   # typecheck; there is no npm script for it
npm run lint       # ESLint, with Prettier as a rule
```

No environment variable is needed: the AI features run on the account each visitor links in the
app. To run a production build locally, use `npm run build` and then
`node .output/server/index.mjs`; it listens on port 3000 unless `PORT` says otherwise.

Baseline on 2026-11-14 with Node.js 22.19 or later: the build and the 70 tests pass. The tests
cover account linking, the Pi SDK adapter, the pop-up and routing. The adapter tests run the
real SDK with the network replaced, and they listen on port 1455, so they fail while a sign-in is
running on the same machine. The typecheck fails with 1 error (`src/routes/styles.tsx:28`,
TS7030). Lint fails with 216 `prettier/prettier` formatting errors and 9 warnings.
`npm run preview` answers HTTP 500 on every page: `vite.config.ts` loads Nitro for builds only.

- Before reporting a code change as finished, run the tests, the typecheck and the build. Add no
  new failures, report against this baseline, and never call a failing run clean.
- Do not run `npm run format` as part of other work: it rewrites most files. New files must pass
  `npx eslint <file>`. In a file that already fails formatting, keep the diff minimal. Clearing
  the baseline is its own formatting-only commit and needs the owner's go-ahead.
- A dependency change must update both lockfiles until the package manager is settled. Write
  `package-lock.json` with npm 11 or later (`npx npm@11 install`; npm 10 strips its `libc`
  fields) and `bun.lock` with `npx bun install --lockfile-only`. `bunfig.toml` refuses package
  versions published in the last 24 hours.

## Conventions

- TypeScript is `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  Import from `src/` through the `@/` alias. Prettier: 100 columns, double quotes, semicolons.
- Never hand-edit the generated `src/routeTree.gen.ts`.
- Before editing `vite.config.ts`, `src/styles.css` or `src/start.ts`, read the comments in that
  file; before adding a route, read `src/routes/README.md`. They state constraints that break
  the build, change the CSS that ships, or remove a protection (CSRF, server-only imports) when
  ignored.
- Style with the semantic Tailwind tokens defined in `src/styles.css` (`bg-background`,
  `text-brand-yellow`, `bg-track-video`), not raw colors. The theme is dark only.
- Server functions use `createServerFn` in `*.functions.ts`. Server-only modules are named
  `*.server.ts` or live in a `server/` directory: the build fails when browser code imports one.
- Only `src/lib/pi.server.ts` imports the Pi SDK (`@earendil-works/*`). Everything else uses the
  `ProviderRuntime` interface in `src/lib/account-link.server.ts`.

## Security

Brief §5 and §9 are binding. In this codebase that means:

- Secrets (users' provider keys and sign-in tokens, the Supabase service-role key, Whop
  credentials) exist only on the server: never in the repository, a log, an error message, the
  browser, or a `VITE_`-prefixed variable, which the build injects into the browser bundle.
  Secrets of the server itself go in `.env` locally, which git ignores; commit only
  `.env.example`.
- Never hand the Pi SDK's default credential store, the file `auth.json`, a value a user typed:
  it runs a key that starts with `!` as a shell command and expands `$NAME` from the server's
  environment. Use its in-memory store, as `src/lib/pi.server.ts` does.
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

Known gaps in the demo, to close when the backend is built and never to copy: nothing is rate
limited, and an account link belongs to a token in the browser's local storage, not to a
signed-in user. The validators of the two AI functions are identity casts, model output is
parsed without a schema, `extractStyle` fetches any URL without a timeout, size cap or address
filter, and user text is interpolated straight into prompts.

## Git

- Never rewrite pushed history. Keep `main` building and passing its tests.
- Keep commits small and single-purpose; never mix formatting with behavior changes.

## Maintaining this file

- Update "Status", "Open decisions", "The code today" and the baseline in the same change that
  makes them stale. Keep the file short; detail belongs in `product-brif.md` or `docs/`.
- Write scoped package names in backticks: `CLAUDE.md` imports this file, and Claude Code reads
  a bare `@path` as a file to import.
