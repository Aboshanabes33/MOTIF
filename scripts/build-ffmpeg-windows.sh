#!/usr/bin/env bash
set -euo pipefail
: "${LLVM_MINGW_ROOT:?Set LLVM_MINGW_ROOT to llvm-mingw20261117 ucrt Ubuntu x64}"
: "${SOURCE_BUNDLE:?Set SOURCE_BUNDLE to the matching source asset directory}"
export PATH="$LLVM_MINGW_ROOT/bin:$PATH"
work=$(pwd)/controlled-build
mkdir -p "$work"
tar -xzf "$SOURCE_BUNDLE/x264-source-exact.tar.gz" -C "$work"
tar -xzf "$SOURCE_BUNDLE/FFmpeg-74e4393595.tar.gz" -C "$work"
cd "$work/x264-stable"
./configure --host=x86_64-w64-mingw32 --cross-prefix=x86_64-w64-mingw32- --enable-static --disable-cli --disable-asm --prefix="$work/prefix"
make -j2 && make install
cd "$work/FFmpeg-74e4393595cf2b5857f0da925c4e0dd74ea306e5"
export PKG_CONFIG_LIBDIR="$work/prefix/lib/pkgconfig"
./configure --target-os=mingw32 --arch=x86_64 --enable-cross-compile --cross-prefix=x86_64-w64-mingw32- --cc=x86_64-w64-mingw32-clang --cxx=x86_64-w64-mingw32-clang++ --enable-gpl --enable-libx264 --enable-static --disable-shared --disable-autodetect --disable-x86asm --disable-doc --disable-debug --disable-ffplay --disable-network --extra-cflags="-I$work/prefix/include" --extra-ldflags="-L$work/prefix/lib" --pkg-config=pkg-config --pkg-config-flags=--static
make -j2 ffmpeg.exe ffprobe.exe
