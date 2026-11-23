# Media pipeline implementation status

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
