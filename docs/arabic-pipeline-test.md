# Real Arabic pipeline test and v0.1.0 experiment

The source is a generated25-second Gulf Arabic speech sample. It was made into a plain teal640x360 MP4 and imported through MediaWorkspace's actual source-copy implementation. These tests exercised the real UI/MCP backing service, not native file dialogs for this particular sample.

- FFmpeg720p derivative succeeded in1.7seconds.
- Original cached OpenAI Whisper base completed in36.9seconds, but corrupted several Arabic phrases.
- Real HyperFrames0.9.88 burned the untouched base transcript into an H264/AAC MP4. The new MediaWorkspace captions job succeeded in53.8seconds under concurrent CPU load. Actual rendered frame inspected: RTL text readable, but semantic errors are preserved.
- Full multilingual large-v3,5-bit quantized, downloaded freely from whisper.cpp's official model collection. Whole-clip inference exceeded110seconds. A local whisper.cpp build with native CPU optimizations and bounded8-10second audio chunks successfully transcribed all the speech across three manual chunks, taking31.3+34.3+31.0seconds (96.6seconds inference total). These hand-chosen boundaries are not proof of the final automatic chunking path, whose first integrated rerun was interrupted at120seconds.
- large-v3 correctly recovered most base errors, but still confused the phrase about perfection stopping you and the closing phrase about sharing with friends. No production accuracy claim or fabricated percentage.

## New default

Transcription now requires `whisper-cli` (whisper.cpp), FFmpeg, and `~/.cache/whisper/ggml-large-v3-q5_0.bin`. MOTIF never downloads a model automatically. It extracts at most60seconds of mono16kHz audio in ten-second chunks, runs the model with bounded audio context and one CPU thread, and writes a common JSON transcript. No provider or paid API is used. Each process has a120second timeout. Boundary accuracy, cancellation during transitions, language auto-detection speed, longer media and Windows inference remain unverified. Default is selected for this experiment, not a promise that it is universally best.

HyperFrames captions require the installed `hyperframes` executable. They use the latest successful local transcript, a fixed escaped HTML template,640x360 at12fps, software GPU and one worker. Caption job input/output stays inside the selected project. No arbitrary agent HTML or shell commands are accepted. Captions are not human-corrected. Render duration currently follows transcript end, so trailing silence can be trimmed.

## Experimental Windows release

v0.1.0 is a portable unsigned Windows x64 EXE built from this PR head, not merged into main by this change. Cross-built on Linux, not run on a real Windows machine. Windows may show SmartScreen/signature warnings. FFmpeg, whisper.cpp, the model, HyperFrames and agent clients are NOT bundled. Node-based `.cmd` shims may not be detected on Windows. The app should show unavailable tools rather than invent success. Do not use untrusted media/project folders. Hostile filesystem/process isolation, full editor controls, preview/export UI, automatic model setup, generic embedded agent chat and production support remain incomplete. See local-media-workflow.md for inherited limitations.
