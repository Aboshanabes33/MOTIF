# MOTIF Production Code Review

**Review date:** 2026-11-22  
**Reviewed commit:** `9f7199b86bc680aee457f2b6424bbe5018fe8c0d`  
**PR:** #28 — Motif default web shell: Brands, AI onboarding, real model choices  
**Scope:** PR #28 UI/UX changes, `dsh-motif-core`, Relay integration/configuration, Brand persistence, AI connection flow, and the newly introduced user-facing surfaces.

## Executive summary

The latest changes are a meaningful step toward making MOTIF a real product shell rather than a branded Harness chat. The Brand list/create flow, workspace registration, model routes, and native CLI connection services are useful foundations.

**Production readiness: NOT READY.** The primary blockers are not the Relay execution itself (the owner reports successful background runs with both Claude Code and Codex), but the newly introduced product surfaces that currently look functional while containing prototype/no-op interactions, plus persistence and platform reliability gaps.

This is a remote code review of GitHub source. I did not clone the repository, run its build/typecheck/tests, launch the app, or perform browser/device testing. Findings below are code-based unless explicitly marked as a risk requiring reproduction.

## Findings

### [P1] Brand editor is a non-functional prototype presented as a real editor

**Files**
- `packages/client/ui-motif/src/client/MotifSection.tsx` — `BrandEditor` (around lines 480–620; verify exact line numbers in current checkout)
- `packages/client/ui-motif/src/client/MotifSection.module.css` — editor styles (around lines 653–767)

The editor shows a request history, composer, preview, transport slider, timeline lanes, and Export Request, but these are static/demo values. The composer input is uncontrolled and Send does not submit; Export Request has no handler; the timeline slider only changes its own thumb; lanes are hard-coded; the preview is not connected to media; and labels such as `v6 · just now`, `0:13`, `0:22`, and `Ready` are static.

**Impact:** Users can reasonably assume they are editing/rendering a video when none of these controls are connected to an editing pipeline. This is a production-blocking product integrity issue.

**Recommendation:** Either hide/disable this editor until its interactions are implemented, or clearly label it as a preview/prototype. For production, wire the composer to the actual Session/Relay, load the actual Source Video and timeline, persist edits, reflect run states, and implement/export only actions that work.

---

### [P1] “From website” and “From Reference Video” start paths do not perform their advertised workflows

**File:** `packages/client/ui-motif/src/client/MotifSection.tsx` — `BrandsSection` and `NewBrand` (around lines 227–280 and 350–430)

All three cards (“Manually”, “From a website”, “From a Reference Video”) only set `creating=true`, so they open the same manual form. The Website field is not bound to state or submitted. There is no reference-video file input or extraction workflow.

**Impact:** Two onboarding options advertise capabilities that do not exist; users cannot tell which workflow they selected and receive no website/video analysis.

**Recommendation:** Implement distinct, stateful creation paths (URL extraction and reference-video upload/analysis) or hide these choices until available. Keep the manual path explicit.

---

### [P1] API-key fallback UI is entirely inert

**File:** `packages/client/ui-motif/src/client/MotifSection.tsx` — `AiSection` (around lines 178–184)

The password input has no state or handler. “Save and test” has no click handler. No API-key provider, validation, secure storage, model selection, or test request is connected.

**Impact:** The UI promises an API-key fallback to users without a subscription, but entering a key and clicking the button does nothing. This is misleading and can erode trust.

**Recommendation:** Remove the card until implemented, or wire it end-to-end. Never persist a key in renderer/local storage; send it through a secure Host credential flow and make storage, validation, provider, and deletion behavior explicit.

---

### [P1] Brand creation is not atomic; duplicate-name races can overwrite another Brand

**File:** `packages/motif/motif-core/src/brand-store.ts` — `createBrand()` (around lines 120–141)

The code checks `stat(path)` and then creates directories with `mkdir(..., { recursive: true })`. The check and create are separate operations. Two concurrent requests with the same slug can both pass the check and write to the same folder. The recursive mkdir also accepts an already-created directory, so the second request can overwrite `brand.json`, `brand.md`, or logo files.

**Impact:** Concurrent create requests can overwrite user data or mix partial Brand data.

**Recommendation:** Use an exclusive directory creation strategy (non-recursive mkdir of the final slug after creating the root), handle `EEXIST` explicitly, write files to temporary paths and rename atomically where practical, and clean up only the directory created by the current operation on failure. Add a concurrency test.

---

### [P1] Brand folder can be orphaned if Workspace registration fails

**File:** `packages/motif/motif-core/src/index.ts` — `MotifController.createBrand()` (around lines 95–115)

The folder is created first, then `workspaceRegistry.create()` and `workspace.setTitle()` are called. If Workspace registration fails, the Brand folder remains on disk but the API returns an error. On subsequent snapshots, that Brand may have no `workspaceId`, and the UI disables its Open button.

**Impact:** A user can see a failed creation while a partial Brand persists and cannot be opened through the UI.

**Recommendation:** Make folder creation + Workspace registration a recoverable transaction: rollback the new folder if registration fails, or add a repair/re-register path and report the persisted Brand accurately. Test failures at both registration and title-setting steps.

---

### [P1] Global CLI installation is likely broken on Windows

**File:** `packages/motif/motif-core/src/connection.ts` — `installBackend()` (around lines 122–136)

The installer invokes `execFile('npm', ...)` without a shell or resolving the platform-specific executable. On Windows, npm is commonly exposed as `npm.cmd`; `execFile` does not reliably execute `.cmd` wrappers without shell handling. This needs a Windows-specific implementation and verification.

**Impact:** Users on Windows may click Install and receive a process-launch error even when Node/npm are installed.

**Recommendation:** Resolve npm's executable for the OS (e.g. npm.cmd on Windows) or use a carefully constrained shell invocation on Windows only. Add CI coverage for the actual installer command on Windows, with mocked process behavior and a packaged smoke test.

---

### [P2] Arabic-only Brand names collapse to the same slug

**File:** `packages/motif/motif-core/src/brand-store.ts` — `slugify()` (around lines 43–50)

The slug is limited to ASCII letters/numbers. Arabic-only names normalize to an empty slug and become `brand`. This means different Arabic names collide and only one can be created.

**Impact:** Arabic-first users cannot create multiple Brands with Arabic names unless they add Latin characters.

**Recommendation:** Preserve Unicode letters/numbers in safe slugs, transliterate Arabic, or append a deterministic unique suffix. Add tests for several distinct Arabic names and mixed-language names.

---

### [P2] Brand-list and Brand-read errors are silently treated as “no Brands”

**File:** `packages/motif/motif-core/src/brand-store.ts` — `listBrands()`, `readBrand()`, `countVideos()` (around lines 145–200)

`listBrands` swallows every `readdir(root)` error and returns an empty array. `readBrand` swallows all read errors and malformed JSON. `countVideos` also turns any filesystem error into zero.

**Impact:** Permission problems, disk errors, or corrupted Brand files appear as an empty Brand list or missing data, making users believe their Brands were deleted.

**Recommendation:** Treat only `ENOENT` as an empty/missing path. Surface permission/I/O errors with a diagnostic and distinguish corrupt Brand files from absent Brand files. Add tests for permission errors and invalid stored JSON/schema.

---

### [P2] “Videos” count counts all timeline files, not videos

**File:** `packages/motif/motif-core/src/brand-store.ts` — `countVideos()` (around lines 145–148)

Every non-hidden file in `timeline/` is counted, including JSON timelines, Markdown notes, captions, and metadata. The UI displays this number as “videos”.

**Impact:** The Brand list displays inaccurate counts as soon as timeline metadata files exist.

**Recommendation:** Count actual video assets/source/result files using the product's file schema, or rename the UI metric to “timeline files” until video tracking exists.

---

### [P2] Connection sign-in reports success before confirming the child process started

**File:** `packages/motif/motif-core/src/connection.ts` — `signInBackend()` (around lines 149–176)

The detached process uses `stdio: 'ignore'`, immediately calls `unref()`, and returns success. A spawn error can arrive asynchronously via the child's `error` event and is not caught by this try/catch. Also, some CLI login flows require an interactive terminal; the current detached/no-stdio path is not proven to support those flows.

**Impact:** UI may say “sign-in window opened” when the process failed to launch or when the CLI needs a TTY.

**Recommendation:** Handle the child `error` event, verify the login flow for both CLIs on each supported OS, and use a provider-supported browser/device-code flow or an interactive terminal strategy when required. Do not claim success until launch is confirmed.

---

### [P2] Relay status can remain “started” when Brand context reading fails

**File:** `packages/llm/llm-motif-relay/src/adapter.ts` — `stream()` (around lines 227–235)

The adapter emits `started`, then reads the Brand snapshot and builds the task before entering the start/activation error-handling block. If `readBrand()` fails (permissions, I/O error, unexpected file), the request throws but no `failed` status is emitted. The timeout/cancellation controller is also created only after the Brand snapshot is read.

**Impact:** Status observers can be left with a non-terminal state; cancellation/timeout do not cover context preparation.

**Recommendation:** Wrap the entire post-`started` phase in a terminal-state handler, emit `failed` for snapshot/task preparation failures, and start cancellation/deadline handling before any potentially slow preparation. Add a test where `readBrand` rejects and assert terminal status.

---

### [P2] “Active AI” indicators are not connected to the selected/used backend

**Files**
- `packages/client/ui-motif/src/client/MotifSection.tsx` — `AiSection` (around lines 103, 187–193)
- Same file — `MotifHome` (around the final home-status component)

The AI settings page defines the “active” connection as the first card whose sign-in state is `yes`, not the model selected in the Session. The home status is hard-coded to “Claude Code”. This can display Claude as active when Codex is the selected model—or when neither backend has actually been used.

**Impact:** Incorrect connection/status information.

**Recommendation:** Derive the status from the selected model/provider or remove the “Active now” claim and use “Connected accounts” until selection state is available.

---

### [P2] New UI has no dedicated UI tests, and the PR did not exercise it in a real browser

**Files:** `packages/client/ui-motif/` (new package)

The new package contains no UI tests. The PR's verification notes explicitly state the UI was not exercised in a real browser. Core tests cover Brand storage and connection helpers, but not UI state, form behavior, responsive layouts, Remote integration, or the onboarding lifecycle.

**Impact:** The most user-visible new code has no regression protection. Typecheck/build alone cannot catch inert buttons, overlay lifecycle problems, incorrect states, keyboard/accessibility issues, or layout breakage.

**Recommendation:** Add browser tests for: onboarding dismissal/setup, connection install/sign-in/test states, Brand create/duplicate/error paths, upload validation, open Brand, and all three start paths. Add mobile/keyboard/accessibility smoke tests. Test the composed default profile, not only the isolated package.

---

### [P2] Brand editor layout has no responsive treatment for narrow screens

**File:** `packages/client/ui-motif/src/client/MotifSection.module.css` — editor layout (lines 677–681)

The editor uses a fixed 340px chat column plus the stage, with no editor-specific breakpoint. The existing media query around 558 only collapses the AI/form layouts. On narrow screens, the stage is squeezed and the two-column editor becomes unusable.

**Impact:** Mobile/narrow-window users cannot use the editor layout comfortably.

**Recommendation:** Add an editor breakpoint that stacks panels, switches the chat panel to a drawer/tab, makes controls touch-friendly, and prevents horizontal overflow. Add viewport tests.

---

### [P2] Logo upload lacks size and content validation

**Files**
- `packages/client/ui-motif/src/client/MotifSection.tsx` — file upload handler
- `packages/motif/motif-core/src/brand-store.ts` — `decodeLogo()` (around lines 104–110)

The client reads the entire file into a base64 Data URL without a size limit. The Host accepts a matching MIME-shaped Data URL and decodes it with permissive `Buffer.from(..., 'base64')`; it does not enforce a maximum byte size or verify file signatures. SVG is accepted without sanitization.

**Impact:** Large uploads can cause high memory/disk usage; malformed/mismatched files can be stored; SVG should be treated as untrusted input.

**Recommendation:** Enforce a small logo size limit on both client and Host, validate decoded size and file signatures, sanitize or disallow SVG (prefer raster formats), and avoid storing the base64 Data URL redundantly in `brand.json` when a local asset exists.

---

### [P3] Brand schema/version is declared but not validated

**File:** `packages/motif/motif-core/src/brand-store.ts` — `StoredBrand` / `readBrand()` (around lines 29–36 and 156–176)

A `version: 1` schema exists, but read does not validate the version, identity fields, logo type, or `updatedAt`. Invalid data can be merged into the fallback identity; unexpected types may break sorting/rendering or produce invalid CSS values.

**Recommendation:** Add runtime schema validation and explicit migrations. Invalid Brand records should be surfaced with a repair/export option rather than silently accepted or dropped.

---

### [P3] Connection snapshot probes CLIs sequentially and can be slow

**File:** `packages/motif/motif-core/src/connection.ts` — `inspectConnections()` (around lines 76–105)

The two `--version` probes are awaited in a loop, each with a 5-second timeout. A slow/unresponsive executable can delay the snapshot by up to roughly 10 seconds, and the onboarding/settings surfaces may request separate snapshots.

**Recommendation:** Probe both backends concurrently with `Promise.all`, cache short-lived probe results, and avoid duplicate checks when onboarding and settings are mounted together. Show per-card loading states rather than blocking the whole section.

---

## Production gate / recommended order

1. **Remove or clearly disable prototype-only editor actions** until they are connected (Send, Export, timeline, preview).
2. **Remove or implement API-key UI and website/reference-video Brand creation.**
3. **Fix Brand storage atomicity and Workspace-registration recovery.**
4. **Fix Windows installation and validate sign-in launch on Windows/macOS/Linux.**
5. **Add runtime validation, Arabic-safe slugging, upload limits, and truthful Brand counts.**
6. **Fix Relay terminal status handling around Brand snapshot preparation.**
7. **Connect “active AI” status to actual selection and remove hard-coded Claude status.**
8. **Add browser-level tests and mobile responsive/accessibility coverage.**
9. **Run full CI, package build, typecheck, unit tests, profile composition tests, and platform packaging smoke tests.**

## Positive observations

- The Relay supports separate Claude Code and Codex routes and explicit model choices rather than silent fallback.
- The user reports both CLI agents have successfully run in the background.
- Brand identity is stored in a local Brand folder and rendered into `brand.md`, which gives the Relay a straightforward source of truth.
- Brand creation and AI connection helpers have unit tests.
- The PR reports clean TypeScript checks for the new core/UI packages and 62 relay/core tests passing with 3 skipped.
- The connection UI includes an explicit experimental-use notice for subscription relay behavior.

## Verification caveat

The latest GitHub Actions real-API E2E run associated with the reviewed merge commit was marked **failed**. The available job response had no steps and its logs could not be retrieved, so this review cannot attribute that failure to a code regression. The PR also states that the new UI was not tested in a real browser. These checks need to be rerun and the failure diagnosed before production release.
