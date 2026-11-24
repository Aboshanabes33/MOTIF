# Media pipeline implementation status

## Current merged implementation, November 24

PR #103 and follow-up work are merged with owner's approval, not full acceptance. Code includes local review UI, owner-only HTTP import/revision/job/output routes, byte-range streaming, real Host cookie admission tests, durable interrupted/completed job recovery, retained-media admission checks and a separately gated selected-Session JSON proposal bridge. Production renderer verification remains false. Issue #78 remains incomplete.

Real developer smoke passed with FFmpeg/ffprobe, OpenAI Whisper 20250625 base and HyperFrames 0.9.88. First, a generated video/tone/title fixture passed. Later, real speech detected English, two segments and 22 word timestamps. A four-second managed Host HTTP render produced a 132,334-byte captioned MP4, with authenticated download/range checks. The actual rendered frame was visually inspected, with readable separate title and caption. The isolated built React component also completed a real browser-to-Host render earlier; this is not full-shell, Session or Electron acceptance.

Captions retime and trim with reviewed clip order, burn into finite escaped HTML, and remain as WebVTT with normalized transcript JSON. Completed-job cleanup removes generated snapshots/audio/cuts, not imported originals or output. Audio-presence verification rejects renders that lose an input audio stream. HyperFrames cache is disabled to avoid external cache symlinks; render lock remains enabled with fail-fast no-wait. Tools were temporary development installs, not Windows product provisioning.

The selected-Session proposal bridge does not make native-agent execution plan-only through prompting. Its separate gate stays false. JSON validation and explicit review exist, but no real provider/Session/media workflow is claimed. Supported Electron, full-shell acceptance, editable caption/Brand styling, transcript-based clip selection UI, music/mixing, user retention controls and OS provisioning/licensing remain unfinished. Provider contracts are unchanged.

Checks: 74 focused backend/UI tests passed before captions; latest six focused carrier/pipeline/storage suites pass 37 tests, with core compiler and real speech managed Host smoke passing. After all four main merges, a combined build/mode/media/account selection passed 103 tests across 13 files. The account follow-up separately passes 14 tests and scoped TypeScript. Wider-suite 19 failures reproduce on baseline, documented in docs/testing/motif-media-workbench.md. None of these replace the memory-blocked full aggregate build or supported Windows/Electron validation.

## Historical foundation status

This change is partial, not the full issue-47 feature. It adds a local structured-plan orchestration module and tests. There is no source picker or editor/Relay integration yet. Do not mark issue #47 closed from this patch.

Verified tools/interfaces:
- HyperFrames 0.9.84, Apache-2.0, verified with installed CLI help. A real one-second H.264 320x180 render succeeded and was probed with FFmpeg. Official contract: https://hyperframes.heygen.com/reference/html-schema and https://hyperframes.heygen.com/guides/rendering .
- FFmpeg and ffprobe 4.4.2 were available in the development environment. Production must provision supported binaries, including libx264/AAC capability, on each target OS. Distribution/build licensing needs review; FFmpeg licensing depends on its configuration.
- The planned transcription adapter uses the official local OpenAI Whisper CLI with JSON output and word timestamps, auto language detection, and the base model. Whisper was not installed or smoke-tested here. Official source: https://github.com/openai/whisper . Installing/downloading model weights is a deployment step, not something triggered silently by a normal edit.

Implemented: typed cuts/titles plan validation, workspace-relative source checks, symlink resolution, format/file-size/duration/dimension limits, argument-array subprocesses with cancellation/timeouts and bounded stdout/stderr, local audio extraction/transcription retry, clip encoding, controlled composition HTML, HyperFrames render, output size/duration/video-stream verification, and persisted plan/job stages. Telemetry disabled for HyperFrames invocations.

Remaining before release:
- Source import/media service integration with existing workspace and authenticated Host boundaries.
- Natural-language instruction to reviewed structured plan using existing selected Session/Relay route, without arbitrary command execution or provider changes.
- UI preview, job status/cancel/retry surfaces and explicit unavailable-tool states.
- Real Whisper/transcription fixtures and actual end-to-end render using source media.
- Finite animated title/transition support, not only static timed overlays.
- Resource ownership: job concurrency, whole-process-tree cancellation, disk/output quotas and atomic stage writes; source copy/lock against races; timeout at the entire job level.
- Transcript word validation and useful transcript-to-clip selection UI.
- Security review of imported container/protocol handling, FFmpeg decoder restrictions and unsafe-file races.
- OS installer and licensing tests.

Do not expose these new functions as a working editor control until those paths are integrated and validated. The existing provider routes are untouched.

## Issue #78 draft, stage 1

The pipeline now requires a supplied runner instead of falling back to direct execFile. `managedMediaRunner` uses the shared subprocess service with bounded output and managed-range teardown. `MediaJobs` is an internal Host owner with a fixed concurrency cap, per-Brand exclusion and cancellation. It is deliberately not exported as an authenticated Remote endpoint.

Plans reject unknown operations. Transcript word timestamps are checked. The source is opened once and copied into a private job snapshot, with before/after file-identity checks; tool invocations use the snapshot. Parent credential environment variables are scrubbed. Plan/status files and encoded stages publish by rename. A whole-job timeout and sampled job-directory quota guard limit work. Quota sampling can overshoot between checks and is not an OS-enforced disk reservation. A hostile same-OS-user process and job-directory replacement are not isolated by this draft.

The editor remains disabled. `MEDIA_EDITOR_READINESS.available` is fixed false, independent of installed binaries. No source picker, account-authorized Remote API, plan-only Session/Relay contract, plan approval UI, preview route or render UI is claimed. Existing BrandEditor export controls remain disabled. The current free-form native-agent Relay is not a safe reviewed-plan boundary and must not be repurposed by prompting alone.

Focused tests include a real local FFmpeg fixture and ffprobe read through a copied source, but intentionally stop before transcription. Whisper and HyperFrames are unavailable in this environment. No full transcription/composition/render smoke test has passed. No tools or model weights were installed, no external service was called and no deployment was changed. This draft does not satisfy the complete issue #78 acceptance criteria and must not close it.

Review follow-up: `MediaJobs.drain()` now aborts active jobs and waits for their render/managed-runner cleanup to settle. `dispose()` alone remains synchronous cancellation; Host shutdown adapters must await drain. Focused cancellation teardown test verifies drain does not resolve while a tool is still cleaning up. This does not connect the editor workflow or complete Whisper/HyperFrames E2E.
