#!/usr/bin/env bash
set -euo pipefail
: "${LLVM_MINGW_ROOT:?Set LLVM_MINGW_ROOT to the extracted llvm-mingw20261117 toolchain}"
: "${WHISPER_SOURCE:?Set WHISPER_SOURCE to whisper.cpp092fa10992dec2a91680591697c857b566db7150}"
if [ "$(git -C "$WHISPER_SOURCE" rev-parse HEAD)" != '092fa10992dec2a91680591697c857b566db7150' ]; then echo 'Wrong whisper.cpp source revision' >&2; exit 1; fi
root=$(cd "$(dirname "$0")/.." && pwd)
cmake -S "$WHISPER_SOURCE" -B "$root/.whisper-windows-build" -DCMAKE_TOOLCHAIN_FILE="$root/docs/runtime/whisper-static-toolchain.cmake" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_STATIC=ON -DGGML_OPENMP=OFF -DGGML_NATIVE=OFF -DGGML_BACKEND_DL=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
cmake --build "$root/.whisper-windows-build" --target whisper-cli -j 2
