#!/usr/bin/env python3
"""
Build a self-contained, native Windows x64 GUI executable:
  release/MOTIF-Portable-<version>-x64.exe

Contents:
  1. Native Win32 PE64 GUI launcher (zig cc -target x86_64-windows-gnu -mwindows -municode)
     with embedded build/icon.ico, VS_VERSION_INFO, and PerMonitorV2 DPI manifest.
  2. Spec-compliant SFX ZIP archive (offset-adjusted) bundling:
     - runtime/node.exe (Node.js 24 LTS Windows x64)
     - dist-web/** (compiled React 19 Liquid Glass app + fonts + icons)
     - server/**, mcp/**, launcher/start-motif.mjs, build/icon.{ico,png}, package.json

Also cross-verifies PE headers, Win32 resources, DLL imports, `unzip -t`,
and runs a native-compiled miniz extractor test verifying SHA-256 byte-for-byte match
of every single packed file.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BUILD_CACHE = Path(os.environ.get("MOTIF_WIN_BUILD_CACHE", "/tmp/motif-win-build"))
RELEASE_DIR = REPO_ROOT / "release"

NODE_WHEEL_URL = (
    "https://files.pythonhosted.org/packages/88/d1/"
    "e3be8fa327a795bcaf7a19cd84299e338a7bce32ff0665fdce9cfa22573c/"
    "nodejs_wheel_binaries-24.19.0-py2.py3-none-win_amd64.whl"
)
MINIZ_URL = "https://codeload.github.com/richgel999/miniz/tar.gz/refs/tags/3.0.2"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=str(cwd or REPO_ROOT), check=True)


def ensure_toolchain() -> tuple[str, Path, Path]:
    BUILD_CACHE.mkdir(parents=True, exist_ok=True)
    venv_python = BUILD_CACHE / "venv" / "bin" / "python"
    if not venv_python.exists():
        run([sys.executable, "-m", "venv", str(BUILD_CACHE / "venv")])
        run([str(BUILD_CACHE / "venv" / "bin" / "pip"), "install", "--quiet", "ziglang"])

    node_exe = BUILD_CACHE / "node.exe"
    if not node_exe.exists():
        whl = BUILD_CACHE / "nodejs-win64.whl"
        if not whl.exists():
            run(["curl", "-fsSL", "-o", str(whl), NODE_WHEEL_URL])
        with zipfile.ZipFile(whl, "r") as zf:
            with zf.open("nodejs_wheel/node.exe") as src, node_exe.open("wb") as dst:
                shutil.copyfileobj(src, dst)

    miniz_dir = BUILD_CACHE / "miniz-3.0.2"
    if not (miniz_dir / "miniz.c").exists():
        tgz = BUILD_CACHE / "miniz.tar.gz"
        if not tgz.exists():
            run(["curl", "-fsSL", "-o", str(tgz), MINIZ_URL])
        run(["tar", "-xzf", str(tgz), "-C", str(BUILD_CACHE)])

    export_h = miniz_dir / "miniz_export.h"
    if not export_h.exists():
        export_h.write_text("#ifndef MINIZ_EXPORT\n#define MINIZ_EXPORT\n#endif\n", encoding="utf-8")

    return str(venv_python), node_exe, miniz_dir


def adjust_zip_offsets_for_sfx(zip_bytes: bytes, stub_len: int) -> bytes:
    """Shift ZIP central directory & local header offsets by +stub_len (equivalent to `zip -A`)."""
    data = bytearray(zip_bytes)
    eocd_sig = b"PK\x05\x06"
    eocd_pos = data.rfind(eocd_sig)
    if eocd_pos == -1:
        raise RuntimeError("EOCD signature not found in payload.zip")

    disk_no, cd_disk, entries_disk, entries_total, cd_size, cd_offset, comment_len = (
        struct.unpack_from("<HHHHIIH", data, eocd_pos + 4)
    )
    if cd_offset == 0xFFFFFFFF or entries_total == 0xFFFF:
        raise RuntimeError("ZIP64 payload not expected for MOTIF bundle")

    pos = cd_offset
    for _ in range(entries_total):
        if data[pos : pos + 4] != b"PK\x01\x02":
            raise RuntimeError(f"Bad central directory header at offset {pos}")
        fname_len, extra_len, cmt_len = struct.unpack_from("<HHH", data, pos + 28)
        local_hdr_ofs = struct.unpack_from("<I", data, pos + 42)[0]
        struct.pack_into("<I", data, pos + 42, local_hdr_ofs + stub_len)
        pos += 46 + fname_len + extra_len + cmt_len

    struct.pack_into("<I", data, eocd_pos + 16, cd_offset + stub_len)
    return bytes(data)


def inspect_pe64(exe_path: Path) -> dict:
    with exe_path.open("rb") as f:
        data = f.read(1024 * 1024)
    if data[:2] != b"MZ":
        raise RuntimeError("Missing MZ DOS header")
    pe_off = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe_off : pe_off + 4] != b"PE\x00\x00":
        raise RuntimeError("Missing PE signature")
    machine, num_sections, _, _, _, opt_size, _ = struct.unpack_from("<HHIIIHH", data, pe_off + 4)
    opt_off = pe_off + 24
    opt_magic = struct.unpack_from("<H", data, opt_off)[0]
    subsystem = struct.unpack_from("<H", data, opt_off + 68)[0]

    sections = []
    sec_off = opt_off + opt_size
    for i in range(num_sections):
        name = data[sec_off + i * 40 : sec_off + i * 40 + 8].rstrip(b"\x00").decode("ascii", "replace")
        vsize, vaddr, rsize, rptr = struct.unpack_from("<IIII", data, sec_off + i * 40 + 8)
        sections.append({"name": name, "vsize": vsize, "vaddr": vaddr, "rsize": rsize, "rptr": rptr})

    # Parse import table DLL names
    import_rva, import_sz = struct.unpack_from("<II", data, opt_off + 112 + 8)
    dlls = []
    if import_rva:
        def rva_to_off(rva: int) -> int | None:
            for s in sections:
                if s["vaddr"] <= rva < s["vaddr"] + max(s["vsize"], s["rsize"]):
                    return s["rptr"] + (rva - s["vaddr"])
            return None

        imp_off = rva_to_off(import_rva)
        if imp_off is not None:
            idx = 0
            while True:
                oft, ts, fwd, name_rva, ft = struct.unpack_from("<IIIII", data, imp_off + idx * 20)
                if not any((oft, ts, fwd, name_rva, ft)):
                    break
                n_off = rva_to_off(name_rva)
                if n_off is not None:
                    end = data.index(b"\x00", n_off)
                    dlls.append(data[n_off:end].decode("ascii", "replace"))
                idx += 1

    return {
        "machine": hex(machine),
        "pe32plus": opt_magic == 0x20B,
        "subsystem": subsystem,  # 2 = WINDOWS_GUI
        "sections": [s["name"] for s in sections],
        "dlls": dlls,
    }


def collect_bundle_files(node_exe: Path) -> list[tuple[str, Path]]:
    entries: list[tuple[str, Path]] = []

    entries.append(("runtime/node.exe", node_exe))
    entries.append(("package.json", REPO_ROOT / "package.json"))
    entries.append(("launcher/start-motif.mjs", REPO_ROOT / "launcher" / "start-motif.mjs"))
    entries.append(("build/icon.ico", REPO_ROOT / "build" / "icon.ico"))
    entries.append(("build/icon.png", REPO_ROOT / "build" / "icon.png"))

    for folder in ("dist-web", "server", "mcp"):
        root = REPO_ROOT / folder
        if not root.exists():
            raise RuntimeError(f"Missing required directory: {root}")
        for p in sorted(root.rglob("*")):
            if p.is_file():
                rel = p.relative_to(REPO_ROOT).as_posix()
                entries.append((rel, p))

    return entries


def main() -> None:
    pkg = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
    version = pkg.get("version", "2.0.0")
    out_name = f"MOTIF-Portable-{version}-x64.exe"
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    out_exe = RELEASE_DIR / out_name

    if not (REPO_ROOT / "dist-web" / "index.html").exists():
        run(["npm", "run", "build"])

    zig_py, node_exe, miniz_dir = ensure_toolchain()
    miniz_srcs = [
        str(miniz_dir / "miniz.c"),
        str(miniz_dir / "miniz_tdef.c"),
        str(miniz_dir / "miniz_tinfl.c"),
        str(miniz_dir / "miniz_zip.c"),
    ]

    with tempfile.TemporaryDirectory(prefix="motif-sfx-") as tmp:
        tmp_dir = Path(tmp)
        res_file = tmp_dir / "motif.res"
        stub_exe = tmp_dir / "motif-stub.exe"
        payload_zip = tmp_dir / "payload.zip"

        # 1. Compile Win32 resources (official MOTIF icon + version info + PerMonitorV2 manifest)
        run(
            [
                zig_py,
                "-m",
                "ziglang",
                "rc",
                "/fo",
                str(res_file),
                str(REPO_ROOT / "launcher" / "motif.rc"),
            ],
            cwd=REPO_ROOT / "launcher",
        )

        # 2. Cross-compile Windows x64 GUI PE executable (-Wl,--subsystem,windows -municode)
        run(
            [
                zig_py,
                "-m",
                "ziglang",
                "cc",
                "-target",
                "x86_64-windows-gnu",
                "-O2",
                "-Wall",
                "-Wextra",
                "-municode",
                "-Wl,--subsystem,windows",
                f"-I{miniz_dir}",
                str(REPO_ROOT / "launcher" / "motif-launcher.c"),
                *miniz_srcs,
                str(res_file),
                "-o",
                str(stub_exe),
                "-luser32",
                "-lkernel32",
            ]
        )

        # 3. Build DEFLATE-compressed payload.zip
        entries = collect_bundle_files(node_exe)
        expected_hashes: dict[str, str] = {}
        print(f"Packing {len(entries)} files into Windows SFX payload...", flush=True)
        with zipfile.ZipFile(payload_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for arcname, src in entries:
                zf.write(src, arcname=arcname)
                expected_hashes[arcname] = sha256_file(src)

        stub_bytes = stub_exe.read_bytes()
        zip_bytes = adjust_zip_offsets_for_sfx(payload_zip.read_bytes(), len(stub_bytes))
        out_exe.write_bytes(stub_bytes + zip_bytes)

        # 4. Verify PE64 structure, subsystem, resources, and DLL imports
        pe = inspect_pe64(out_exe)
        print("PE64 verification:", json.dumps(pe))
        assert pe["machine"] == "0x8664", f"Expected AMD64 PE, got {pe}"
        assert pe["pe32plus"], "Expected PE32+ (64-bit)"
        assert pe["subsystem"] == 2, f"Expected WINDOWS_GUI subsystem (2), got {pe['subsystem']}"
        assert ".rsrc" in pe["sections"], "Missing .rsrc icon/version resource section"
        for dll in pe["dlls"]:
            low = dll.lower()
            ok_dll = low in {"kernel32.dll", "user32.dll", "msvcrt.dll", "ucrtbase.dll"} or low.startswith(
                "api-ms-win-crt-"
            )
            assert ok_dll, f"Unexpected non-system DLL import: {dll}"

        # 5. Verify standard unzip integrity
        run(["unzip", "-tq", str(out_exe)])

        # 6. Compile & execute the EXACT same motif-launcher.c extractor natively on Linux
        test_bin = tmp_dir / "test-extractor"
        extract_dir = tmp_dir / "extracted"
        run(
            [
                "gcc",
                "-O2",
                "-DMOTIF_TEST_CLI",
                f"-I{miniz_dir}",
                str(REPO_ROOT / "launcher" / "motif-launcher.c"),
                *miniz_srcs,
                "-o",
                str(test_bin),
            ]
        )
        run([str(test_bin), str(out_exe), str(extract_dir)])

        for arcname, expected in expected_hashes.items():
            extracted_file = extract_dir / arcname
            assert extracted_file.exists(), f"Missing extracted file: {arcname}"
            actual = sha256_file(extracted_file)
            assert actual == expected, f"SHA-256 mismatch on {arcname}: {actual} != {expected}"

        print(f"Verified ALL {len(expected_hashes)} extracted files match SHA-256 byte-for-byte!")

    # 7. Write release/SHA256SUMS.txt
    exe_sha = sha256_file(out_exe)
    exe_size = out_exe.stat().st_size
    sums_path = RELEASE_DIR / "SHA256SUMS.txt"
    sums_path.write_text(f"{exe_sha}  {out_name}\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "ok": True,
                "file": str(out_exe),
                "fileName": out_name,
                "sizeBytes": exe_size,
                "sizeMB": round(exe_size / (1024 * 1024), 2),
                "sha256": exe_sha,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
