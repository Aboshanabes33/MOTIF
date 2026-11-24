# Media workbench status

The Brand editor now has a local video picker/preview, manual cut/title editor, bounded plan review and explicit JSON plan download. Selection uses a temporary browser object URL, revoked when replaced or unmounted. The picker does not copy footage to the Brand or send it anywhere. The path in the plan describes a future imported Brand asset. It must not be passed directly to a job runner until import has completed and Host source validation has passed. Any plan edit invalidates review. JSON is not MP4 export.

45 focused tests pass across the workbench, existing Brand editor, pipeline and job ownership. Client package compiles. The actual browser workbench review surface was inspected. FFmpeg is installed here; Whisper and HyperFrames executables are not, and no end-to-end rendering has been claimed.

Remaining for #78/#87: authenticated bounded binary import and output streaming for the single-user Host; server-held source handles and reviewed-plan revision approval; persistent render/status/cancel UI; Session plan proposal schema, not direct arbitrary edit execution; exact CLI packaging and real local Whisper/HyperFrames installation/smoke tests; captions, Brand styling/audio synchronization; MP4 preview/download; desktop verification. The editor's existing Export stays disabled and the Host readiness flag stays false.

No cloud credentials are needed for the local pipeline itself. Live deployment, multi-user runtime isolation and provider generation remain separately gated. Downloading model weights/tool dependencies needs network and disk capacity, not a secret. This PR does not turn missing executable checks into a user-permission blocker.

## Owner transport continuation

An owner-only `/motif-media` Host route now carries bounded streamed binary imports, server-held reviewed revision IDs, source-byte hashes, start/status/cancel and completed MP4 streaming. It uses the Host webServer admission, explicitly rejects nonowner Peers, requires same-origin browser metadata on mutations and cancels work on Peer disposal or Host shutdown. No arbitrary paths, bearer credentials or output capability links are accepted from the browser. One import and one job at a time; source cap 1 GiB, in-memory retained imports budget 3 GiB, review/job history 100 entries. Failed partial uploads are removed. Imported handles and job history deliberately fail closed on restart; persistent disk cleanup and restart recovery still need implementation. Do not enable this carrier on a long-running shared service.

The Brand editor now has explicit import/render/status/cancel/download controls through this carrier. Production verification is hardcoded false, with no environment bypass: only readiness is readable until the full transport/tool acceptance is complete. MP4 rendering/export remains unavailable. The server code is connected but intentionally gated, not a claim of usable export. The default Web carrier is not an Electron IPC implementation.

35 targeted carrier/UI/import tests plus 20 existing pipeline/job tests pass, both package compilers pass. New owner transport tests use a real HTTP socket but a controlled owner fixture, not live production authentication. Model generation and actual Whisper/HyperFrames execution are still not verified. Output streaming success, cancellation during every stage, full renderer UI flow, persistent job tracking, disk cleanup across restarts, range playback and actual Host token integration require more acceptance tests.

## Real local tool smoke

Installed isolated test-only HyperFrames 0.9.88 and OpenAI Whisper 20250625 with CPU PyTorch. Real one-second FFmpeg video plus audio -> HyperFrames render passed: verified 1280x720, one-second MP4 with audio, frame visually inspected with its title. Real Whisper base-model transcription command passed on the one-second tone fixture (not a speech accuracy test).

Full pipeline integration exposed a real incompatibility: HyperFrames frame extraction defaults to an external cache symlink, correctly refused by the job quota walker. The pipeline now disables that cache explicitly (`HYPERFRAMES_EXTRACT_CACHE_DIR=off`) rather than weakening symlink containment. Full pipeline retry reached rendering but was interrupted by command execution timeout; no complete pipeline success is claimed. Production readiness remains false. Tool installations are temporary test environment setup, not product packaging.

Full real pipeline subsequently passed every stage: probe -> base Whisper transcription -> cut -> composition -> HyperFrames render -> output probe -> completed. Fixture was one-second generated blue video with tone and title, empty speech transcript expected. The repeat initially waited on a stale HyperFrames render lock owned by a zombie from the interrupted smoke. Pipeline now uses `--no-wait` to fail visibly rather than hang behind another render. The successful controlled smoke used a fresh dedicated test lock directory, not disabling render locking. This verifies tool compatibility on a tiny fixture only, not production Host authentication, HTTP download/cancel, speech accuracy, resource limits or desktop acceptance. Readiness remains false.

## Carrier acceptance follow-up

- Real Loader/WebServer/Connection/Token fixture: anonymous request is 401, exchanged owner cookie reaches readiness, cross-site mutation is 403. Production readiness remains false.
- Deterministic HTTP pipeline fixture: import, server review, start, completed status, full HEAD, bounded/suffix-capable byte ranges (206), unsatisfiable range (416), and cross-Brand output refusal.
- Cancellation test waits for the runner to start, requests cancellation, waits for cancelled status and verifies partial output stays unavailable.
- Each record now has its own abort controller, including source rehash before runner start. A synchronous start reservation also fences concurrent starts while the control body is being read.
- These are carrier protocol tests using controlled tool output, not replacements for real Whisper/HyperFrames execution. Restart durability/cleanup, Session proposal integration and full browser/desktop acceptance remain unfinished.

The reviewed source hash is also checked against the private execution snapshot, before any external tool runs. This closes the gap between review-time rehash and the later pipeline copy.

## Restart and retained-storage follow-up

- Small no-follow durable job records are atomically written before execution and after completion. Recovery marks running/cancelling records interrupted, never resumes native tools, and refuses malformed/oversized/symlink records.
- Completed HTTP status/output survive a new carrier instance. Import handles and reviewed revisions deliberately do not, so resubmission requires a fresh import and review.
- Runtime import/render admission recounts retained media bytes across Brands and Host lifetimes. Imports reserve 1 GiB, jobs reserve 3 GiB, against a 6 GiB retained-media ceiling; rendering and upload cannot overlap. The active job's separate 3 GiB monitor remains in force. These are conservative admission checks, not a filesystem quota against unrelated native programs.
- No automatic retention deletion: full history/storage fails closed and requires maintenance. Orphan cleanup UI and Session proposal acceptance remain unfinished. Readiness stays false.

## UI protocol regression follow-up

- Renderer controls now abort an import/review chain when the selected file or reviewed cuts change. Late responses cannot start an obsolete plan. Changing Brand remounts its controls so a prior Brand job does not leak into the new view.
- UI tests exercise matching review -> start -> completed download, server-review mismatch refusal and edits during import. These controlled responses do not establish live browser-to-Host acceptance.

## Selected Session proposal bridge

A gated natural-language proposal path now imports a source and asks the existing Brand `sendEditRequest` Session route to write a bounded JSON proposal. It neither creates an alternate provider nor changes the selected model. The server binds the one-use proposal handle to its Brand/source, opens the result without following a final symlink, validates its size/schema and rejects changed sources or operations. No model text is executed as a command.

The UI checks the proposal separately, shows exact JSON, applies cuts only on explicit action, then invalidates prior review. The user must still preview and Review plan before submitting a render. The prompt asks the existing Session to inspect media and use local Whisper for speech-based timestamps, but this instruction is not a native execution sandbox. Full provider/media Session behavior, progress and speech accuracy remain unverified, and all proposal/render execution remains disabled in production. No paid provider call was made during development.

## Real managed Host HTTP smoke

The actual Loader/Connection/WebServer/Token owner cookie -> binary import -> server revision -> managed subprocess runner -> FFmpeg/Whisper/HyperFrames -> completed output HTTP route passed on the generated one-second video/tone fixture. Whole-file download returned 34,714 bytes and a 32-byte range returned 206. The run took about 38 seconds. This closes the earlier standalone-execFile-only smoke gap; it does not prove speech accuracy or the natural-language Session flow. Production gate is unchanged.

`media-real.host.spec.ts` is opt-in (`MOTIF_REAL_MEDIA_SMOKE=1`). Provision tools and Whisper base weights beforehand. Optional binary overrides are `MOTIF_SMOKE_FFMPEG`, `MOTIF_SMOKE_FFPROBE`, `MOTIF_SMOKE_WHISPER`, `MOTIF_SMOKE_HYPERFRAMES`; `MOTIF_SMOKE_OUTPUT` saves the verified output for inspection. The fixture is generated locally; no provider or download occurs in the test itself. HyperFrames receives a fresh test-owned lock folder, not a disabled lock. This is a supported local tool check on the development Linux environment, not supported desktop distribution acceptance.

Saved Brand jobs can now be loaded explicitly from the controls after refresh, including interrupted records, without retaining import/review capability or starting work. The history endpoint omits filesystem paths and filters by the selected Brand. Mutating HTTP body reads have a 30-second idle and five-minute total limit. Revision replay cannot overwrite/delete an already-completed job record. Pipeline creation refuses a symlinked timeline before writing snapshots.

## Actual browser component smoke

The production-built MediaWorkbench and renderer controls were mounted in an isolated component test page served by the real authenticated Host. Headless Chrome navigated through the actual launch-token cookie exchange, selected the generated fixture, loaded video metadata, clicked Review plan then Import and render, refreshed real status and reached the verified download link. Actual managed FFmpeg/Whisper/HyperFrames ran, no mocked transport. The successful run took about 52 seconds and its completed UI screenshot was inspected. This is component-to-Host acceptance, not the entire MOTIF shell or desktop, and does not exercise the Session proposal sender. The test-only carrier enabled verification locally; the product composition remains false. An earlier runner reached completed but failed browser-profile teardown; after awaiting Chrome exit, the rerun passed.

The Session proposal gate is now separate from render verification and defaults false. Verifying renderer tools does not enable the native-agent proposal sender. Inspection confirmed that native Claude/Codex provider instances advertise no per-run agent preset/options/output-schema capability; ordinary Relay activation cannot enforce a plan-only tool restriction. A constrained provider-contract path is still required before this bridge can be enabled. Prompt wording and JSON validation alone do not satisfy that boundary.

Broader regression check: 328 passed, 19 failed, one opt-in skip across core/UI. All 19 failures reproduce at baseline a7f9f53d: 14 backend schema/error/logo contract failures and five UI stale-slider/createBrand-fixture failures. No tests were removed or expectations weakened. Focused media checks are tracked separately; this is not a green full suite.

## Real speech and burned captions, November 24

The opt-in managed Host HTTP smoke now accepts `MOTIF_SMOKE_SPEECH` pointing to a local speech fixture. No fixture is downloaded automatically. Tested against OpenAI Whisper's JFK test fixture (source: https://github.com/openai/whisper/blob/04f449b8/tests/jfk.flac). Local Whisper base detected English, two segments and 22 word timestamps. A real four-second cut then passed upload, review, managed FFmpeg/Whisper/HyperFrames execution, output download and range requests (132,334 bytes, about 33 seconds). Inspected the actual rendered frame at two seconds: title and transcript caption are readable, separate and inside the frame. This is real speech, not the earlier tone-only fixture, and not an Electron claim.

Generated captions follow reviewed clip order and repeat/trim with source ranges. Captions are escaped finite HTML, burned into the output and retained as WebVTT alongside normalized transcript JSON. They are not yet editable in the UI, translated or karaoke-styled. Completed jobs now remove only their generated source snapshot, extracted audio and cut intermediates; imported originals, output, plan and transcript remain. Failed/interrupted jobs are retained for diagnosis, bounded by the existing runtime quota. There is no user retention/delete UI yet. Output verification rejects lost audio when the input had audio.
