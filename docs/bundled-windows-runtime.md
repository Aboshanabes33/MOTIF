# Windows dependency bundle, work in progress

The requested production direction is a self-contained Windows install, not an instruction to install FFmpeg/HyperFrames/Whisper separately. Existing v0.1.0 is the owner's experimental test build. This PR does not change its assets or metadata, publish a new release, merge, use Actions or spend money.

## Implemented foundation, not a completed bundle

Packaged Windows code resolves tools only from `resources/motif-tools`; it does not silently fall back to random installed PATH tools. Local development retains PATH behavior. HyperFrames is launched with an explicit bundled Node22+ executable and script path, avoiding Windows `.cmd` shims. Its child environment points to the bundled FFmpeg, FFprobe, Whisper and Chromium, so a compatible browser must be staged too. The model resolves from packaged resources rather than the user's cache. No downloads are added to startup.

An alternate `electron-builder.bundled.json` copies `vendor/win32-x64` as real unpacked resources. Its beforePack gate verifies every staged file's size and SHA256 and refuses missing runtime components or an unreviewed redistribution manifest. Files are intentionally not committed to Git. No automatic network bootstrap or made-up hashes are included.

Required layout:

- ffmpeg/ffmpeg.exe, ffmpeg/ffprobe.exe plus required DLLs/notices
- whisper/whisper-cli.exe plus all required DLLs/notices
- node/node.exe and its notices
- hyperframes/node_modules/hyperframes/bin/hyperframes.mjs plus complete locked Windows production dependencies, including platform-native packages
- chrome/chrome.exe plus its entire compatible browser distribution and notices
- models/ggml-large-v3-q5_0.bin
- THIRD_PARTY_NOTICES.txt
- SOURCE-MANIFEST.json with redistributionReviewed:true and a components array describing exact versions, source archives and build materials
- manifest.json with version:1, platform:win32-x64, files:[{path,bytes,sha256}] covering all staged files except itself

Run `node scripts/verify-runtime.mjs vendor/win32-x64`, then electron-builder with `--config electron-builder.bundled.json --win portable --x64 --publish never`. Currently this intentionally FAILS without the complete reviewed payload. It is not an all-in-one working installer yet. The ordinary v0.1.0 build config remains a developer/test configuration and does not assert bundling.

## Size and license gates

The actual downloaded quantized model is1,081,140,203bytes (~1.01GiB). The prior EXE without dependencies is400,705,270bytes. Adding the model alone therefore puts uncompressed content above1.48GB decimal; FFmpeg, Chromium, Node, HyperFrames and their dependencies add more. Final compressed installer size has NOT been measured. GPU runtimes are not planned, CPU only.

HyperFrames0.9.88 package metadata declares Apache-2.0. whisper.cpp and OpenAI Whisper are MIT, requiring notices. Node, Chromium and npm dependencies carry their own notices. A license field is not a completed transitive audit.

FFmpeg's license depends on build flags. The existing render path uses libx264. The convenient Gyan Windows builds are explicitly GPLv3. Do not label them LGPL or ship them with only a URL: exact corresponding source, dependency sources/build materials, notices and redistribution review must be complete. A different LGPL build would require changing/verifying the encoder contract too. This PR does not settle legal compliance or codec patents.

Sources checked:
https://www.ffmpeg.org/legal.html
https://www.gyan.dev/ffmpeg/builds/
https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE
https://raw.githubusercontent.com/openai/whisper/main/LICENSE
https://github.com/ggml-org/whisper.cpp/releases
https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-large-v3-q5_0.bin
https://github.com/heygen-com/hyperframes

## Verification still needed before a bundled release

Obtain and pin exact Windows x64 archives/checksums and corresponding sources, assemble all DLL/native npm/browser/font payloads with notices, validate on a clean offline Windows10/11 machine with PATH scrubbed, run source import -> FFmpeg -> automatic Whisper chunks -> HyperFrames captions, inspect output audio/pixels, test cancellation/missing/corrupt resources and install/uninstall. Browser compatibility/font coverage, telemetry/network behavior, native process isolation and full transcription path remain open. No claim of offline operation until tested with networking disabled. External agent clients and their own authentication are not included automatically in a media runtime bundle.
