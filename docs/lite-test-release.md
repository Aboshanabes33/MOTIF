# MOTIF0.1.1 Lite test

Unbundled test build based on main3c2c198e, including merged PR125,126,127. Exact source commit is the tag target. Distinct prerelease, not a replacement for0.1.0 or0.1.0-lite. Windows x64 portable, LZMA compressed, unsigned. No installer wizard. Not executed on Windows.

New: explicit MCP local-video import with owner approval, licensed SVG navigation and app mark, embedded app/portable executable icon, named Brand color swatches and visual picker with optional advanced hex. Chat upload works only if the agent can access/export a local absolute path. MOTIF must run with a project selected once. No automatic access to hidden/cloud chat attachments.

Lite excludes FFmpeg/FFprobe, whisper.cpp, large-v3 model, HyperFrames, Node and Chromium. For media jobs install the real Windows executables separately on the launching process PATH: ffmpeg.exe, ffprobe.exe, whisper-cli.exe and hyperframes.exe. HyperFrames npm .cmd shim alone is not recognized by the current executable lookup, so captions need an actual compatible executable entrypoint; not bundled or automatically installed. HyperFrames also needs its supported Node/browser runtime and configured Chromium. A bare npm installation is not claimed sufficient. Brand editing/agent setup do not require these media tools.

Transcription needs ggml-large-v3-q5_0.bin in %USERPROFILE%\.cache\whisper (HOME if set takes precedence). No model download is performed. Large-v3 is not replaced by a smaller model. Tool health checks only check executables, not completion of an offline Windows workflow. All paths are per launching process environment; reopen the app after updating PATH.

Checks: local TypeScript/build/tests, real Electron smoke for IPC/Brand persisted color edits and local FFmpeg derivative. Windows PE icon resources inspected. Not Windows-run, not signed; Explorer/taskbar icon cache and pinned shortcut behavior untested. Existing same-app user data may be shared with other MOTIF versions. Back up local brands/project metadata before test. No CI or paid service.
