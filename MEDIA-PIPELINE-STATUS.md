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
