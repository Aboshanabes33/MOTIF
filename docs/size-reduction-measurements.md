# Size measurements, Nov25

Owner confirmed the interaction model: talk to Codex and Claude in their own apps; MOTIF exposes local MCP tools, no embedded chat sender needed. Existing v0.1.0 was marked pre-release at owner's explicit request; no assets/notes/target changed. No new release or merge.

All sizes below are actual local measurements, decimal MB. Compression tests used7z/LZMA fastest `-mx=1 -mmt=1`, not finished installer builds. Component sums are planning estimates, not a measured final EXE.

| Item | Measured bytes | Meaning |
| --- | ---: | --- |
| Existing0.1.0 store-mode EXE |400705270|Published experimental artifact|
| Same unpacked app, LZMA archive |142074169|Installer compression has major benefit, final wrapper overhead not included|
| Current runtime, excluding model, LZMA archive |324769243|Full Chrome, tools and all staged dependencies|
| large-v3-q5_0 raw |1081140203|Current quality default|
| large-v3-q5_0 LZMA archive |1015908188|Only about6% saved; already quantized|
| small-q5_1 raw |190085487|Smaller multilingual model tested below|
| Full Chrome installed |470514394|Current staged tree|
| Matching headless-shell ZIP |127876264|Exact pinned version158.0.8127.36, Windows x64|
| Matching headless-shell installed |297877099|172637295bytes smaller installed, Windows render not verified|
| Current FFmpeg staged |233095011|Gyan9.1 GPLv3 static ffmpeg/ffprobe plus docs|
| Alternative LGPL shared ZIP |83000337|BtbN master win64|
| Alternative LGPL shared installed |202571763|All archive files|
| Alternative LGPL shared bin |187214336|Includes DLLs, ffmpeg, ffprobe and ffplay|
| HyperFrames dependency source maps |11488546|531files; possible dev-only pruning candidate, not yet removed or regression-tested|
| Whisper CLI+all DLLs |17974784|Compared with23943680 whole upstream CPU bundle, potential~6MB prune|

## Recommendation and choices

1. Always use real installer compression. The earlier store mode was a packaging-time workaround, not a minimum application size. App-only archive is142.1MB, not400.7MB.
2. Biggest download reduction: ask permission to fetch the large model automatically inside the app on first transcription, with progress, resumable download and checksum. This avoids a manual install but requires internet the first time, and does not reduce eventual disk use. It changes the previously requested fully bundled/offline behavior, so do not enable silently. Current app+runtime archive sum without model is466.8MB, before headless/pruning improvements. Including current large model archive pushes that sum to1482.8MB. These are sums of measured separate archives, NOT final installer measurements.
3. If fully offline first run matters, offer a compact build using small-q5_1 (~190.1MB raw), with explicit Arabic accuracy warning, and an optional high-quality large-v3 pack. This is a choice for the owner, not an automatic default change. Keep large-v3 default until approved.
4. Replace full Chrome with compatible headless-shell after a real offline Windows HyperFrames regression test. Current version is exactly the HyperFrames pin, but archive presence is not compatibility proof.
5. LGPL FFmpeg is not a drop-in replacement. Existing MOTIF render explicitly uses libx264, and actual HyperFrames software encoding code also selects libx264/libx265. LGPL builds omit those encoders. Changing only the binary would break rendering. Supporting a different software encoder/container or hardware fallback needs code changes and full tests; it is not a safe size-only optimization. LGPL still needs notices/source compliance.
6. Prune source maps, unused Whisper tools and redundant npm/browser data only with import/encoding and license-retention tests. Maximum obvious savings are much smaller than the model. Do not delete DLLs or notice files by filename guess.

## Real Arabic small-model test

Downloaded multilingual ggml-small-q5_1.bin190085487bytes, SHA256 ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb. whisper.cpp CPU1thread, Arabic forced, greedy decoding on same25s speech:16.1seconds, successful JSON. Compared with earlier96.6seconds across manually segmented large-v3 runs; settings/boundaries differ, so not a controlled benchmark. Small retained the main meaning, but misspelled editing/your idea and garbled the perfection-stopping-you/friends phrases. Large-v3 also had phrase errors in the earlier test. No universal accuracy percentage from one synthetic clip. Base was materially worse in the recorded test. Original output saved, not silently corrected.

## Observed sources

https://storage.googleapis.com/chrome-for-testing-public/158.0.8127.36/win64/chrome-headless-shell-win64.zip
https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json
https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl-shared.zip
https://github.com/btbn/ffmpeg-builds
https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/models/README.md
https://huggingface.co/ggerganov/whisper.cpp/tree/main

Local source evidence: HyperFrames0.9.88 software encoder code selects libx264/libx265 in its distributed dist chunks. No Windows execution environment available. Existing runtime redistribution/VC DLL blockers remain. No payload replacement or new release was made for this research.
