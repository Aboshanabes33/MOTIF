# ABSH-99: Can a user reopen a project and edit the selected footage?

**Not in the audited revision.** A user can start a session, see it in the sidebar, and attach filenames. The new session disappears when the application state is recreated. The editor opens a plan preview, not the selected source file. A seeded session surviving a refresh is not evidence that a user-created project was saved.

Audited 2026-11-20 on `arena/ad7d7b64-motif` at `4d3cb4a6d6f68faedc56f713128166e566bc8dc6`. Scope: project and source-video flows only. No product code, storage configuration, or production data was changed.

## Workflow inventory

| Step | Finding | Source evidence |
| --- | --- | --- |
| Name, initialize, list | **Partial.** Sending nonblank text creates a session titled with its first 40 characters. It gets an ID, active style and empty message list and appears first in the sidebar. Preserve same-visit navigation. There is no separate named-project creation or media initialization step. | `src/routes/index.tsx` (`onSend`), `src/lib/store.tsx` (`createSession`), `src/components/Shell.tsx` (`Sidebar`) |
| Reopen and authorize | **Not implemented for durable projects.** Sessions are seeded React state. The record has no owner field; opening a route looks up the ID in that state, not through an authorized project query. Missing IDs lead back to a new session. No durable project or cross-device access can be inferred. | `src/lib/store.tsx` (`Session`, `initialSessions`, `StoreProvider`), `src/routes/session.$id.tsx` (`SessionPage`) |
| Select a folder | **Not implemented.** “Default workspace” is text. There is no directory picker, stored handle, permission check or recovery flow. The ordinary file input is always used, not a feature-detected directory fallback. | `src/components/Shell.tsx` (`Sidebar`), `src/components/Composer.tsx` (attachment input) |
| Select and validate media | **Partial.** The labelled attachment button opens a multi-file picker with `video/*,audio/*,image/*`. Preserve file selection and removable chips. `accept` is a picker hint: the change handler extracts only `name`, with no size, format or content check. Files alone cannot be submitted. Same-name files share a chip key and removing one filters out both. No drop handler. | `src/components/Composer.tsx` (`files`, `send`, input and chip handlers) |
| Upload, process, identify | **Not implemented in this flow.** The route handoff contains strings, not bytes or file handles. No project upload job, progress, interruption/retry/cancel state, measured duration, source thumbnail, storage ID or readiness check was found. Removing a chip is not cancelling an upload. This is not a network audit or a product-wide privacy guarantee. | `src/components/Composer.tsx` (`onSend`), `src/lib/pending.ts`, `src/lib/store.tsx` (`Message.files`) |
| Open in editor | **Partial: preview navigation works in code.** A result card links to the session editor. It reads the latest message plan, derives clips from duration/cut count and draws a styled preview. It has an empty state when there is no plan. Neither this route nor the download button consumes the selected video. | `src/components/ResultCard.tsx`, `src/routes/session.$id_.edit.tsx` (`Editor`) |

## What was verified

A temporary, isolated Vitest component probe passed on Node 22.22.3, Vitest 4.1.12 and jsdom 20.0.3. It mounted the real `Composer` and `StoreProvider`, substituting a recording submit handler and a stub style icon. Selecting a synthetic `fixture.mp4` showed a chip but left Send disabled until text was entered. Sending passed `['fixture.mp4']`, not the `File`. Creating a session in the handler added it to the store; unmounting and remounting the store restored the seed and lost that session. This characterizes the current gaps; it is not a regression requirement to keep losing data.

`src/test/app-routing.test.tsx` checks a route match, not project creation or persistence. No committed project-ingestion lifecycle test was found in `src/test` or `e2e`. No live browser or native file chooser was exercised. Supported browser versions remain unverified; folder denial/revocation and interrupted upload are not testable application states yet. A store remount is not an end-to-end reload test. No credentials, real footage, or remote upload were used.

## First follow-up and boundaries

1. **Start with named project metadata and reopen, not media transfer** (Epic 2 / ABSH-12). Coordinate with the data audit (ABSH-62) before adding schema or owner-scoped queries. Acceptance test: create a named empty project, refresh, reopen it by ID as its owner, and deny access from another account. The project should not require a prompt, file, or folder to exist. Preserve the existing session list; do not present a local cache as cross-device persistence.
2. **Get the product decision before choosing a file path.** ABSH-104 must establish where media may live and be processed. If browser folder access is approved, test feature detection, denial, permission renewal and ordinary file selection in named browsers. Do not treat a local handle as accessible on another device.
3. **Do not start a duplicate upload task.** ABSH-48 owns the storage decision; ABSH-53 already covers conditional remote ingestion. Only test upload interruption, retry, cleanup and editor handoff against a remote store if that transfer is approved. For local-only media, test reselect/relink and verify that no video bytes leave the device instead.
