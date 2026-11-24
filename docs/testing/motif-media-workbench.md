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
