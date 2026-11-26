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

## Actual assembly, Nov25 evening

Real archives and payload are now staged locally (not committed binary files): Gyan FFmpeg9.1 essentials, upstream whisper.cpp b5907 Windows CPU ZIP, Node22.23.5, Chrome for Testing158.0.8127.36 (the HyperFrames pinned version), HyperFrames0.9.88 with77 Windows-target npm packages and the real model. Node/FFmpeg/Whisper archive hashes match upstream published checksums/digest; Chrome's hash is recorded but not independently authenticated by a published checksum. Windows esbuild optional package is present, not the Linux executable. Package lock, source/archive provenance, license inventory and component sizes are committed under docs/runtime. Included upstream notices retained and Whisper/HyperFrames root licenses added.

`inventory-runtime.mjs` hashes every staged file. The verifier passes file integrity then correctly refuses redistribution clearance. No bypass was added. A bundled EXE was therefore NOT built, to avoid treating an incomplete runtime as shippable.

Concrete blocker: PE import inspection shows whisper-cli.exe needs MSVCP140.dll, VCRUNTIME140.dll and VCRUNTIME140_1.dll; ggml CPU DLL also needs VCOMP140.dll. These are not in its archive. Obtain a compliant app-local Microsoft runtime payload or static Windows whisper build before claiming nothing needs separate installation. No Wine or real Windows environment is available for an execution test. FFmpeg corresponding dependency source/build materials and Chromium/transitive npm notice/source review also remain incomplete. The source manifest keeps redistributionReviewed:false. All current payload is internal only, no release/upload.

## Nov26: fully bundled decision and static Whisper

Owner chose to retain the fully bundled large-v3 model, no first-run model download, no small-model default. About1.6GB is an accepted target, not a measured final installer size. Codex and Claude are used in their own apps. Full Chrome retained, no headless replacement. Real compression preserves the same payload.

The upstream MSVC whisper payload has now been replaced locally with a Windows x64 static whisper.cpp CLI built from092fa10992dec2a91680591697c857b566db7150 using llvm-mingw20261117. The4,438,528-byte EXE (see actual inventory for exact size) is statically linked to ggml/C++ with OpenMP disabled and portable CPU settings. PE imports list only Windows/UCRT system libraries, no MSVCP140/VCRUNTIME140/VCOMP140/ggml/whisper DLL dependency. This resolves that dependency at inspection level, NOT execution proof. Speed without OpenMP and real Windows execution remain unverified. Included local source archive, MIT license and LLVM/MinGW notices; reproducible command script and PE import report committed. Requires Windows10/11 UCRT, not arbitrary old Windows.

Release replacement is newly authorized only AFTER actual FFmpeg corresponding-source/notices compliance and package integrity. Current Gyan FFmpeg9.1 source coverage is NOT complete, so redistributionReviewed remains false and no replacement EXE is published, no pre-release flag cleared by this work. Supplied README points to the FFmpeg core commit but does not by itself establish the full matching source/patch/build-material coverage of all linked dependencies. Need that exact source bundle from the distributor or a controlled source-tracked FFmpeg+x264 rebuild. Chromium/npm notice review and clean offline Windows test also remain open. No claim that license text alone completes compliance. GitHub release per-asset ceiling is under2GiB: https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases .

## Controlled FFmpeg replacement and publication verification

Rebuilt FFmpeg from the exact74e4393595 core source and exact saved x264 input archive, with GPL+libx264 enabled, autodetect disabled, no other optional external codec libraries. All native codecs/filters needed by current tests remain. Windows binaries have only Windows/UCRT system imports. Exact FFmpeg+x264 source archives, unmodified inputs, configure outputs, licenses and rebuild scripts prepared as a separate corresponding-source release asset. This replaces Gyan's broad external dependency set. Linux build from the same inputs and equivalent native flags passed the real MOTIF720p derivative (4.5s) and25s HyperFrames H264/AAC captions (18.6s); inspected actual caption frame. The Windows binary was NOT executed. No production/Windows compatibility promise. Full large-v3 model and full Chrome retained.
