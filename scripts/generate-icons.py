#!/usr/bin/env python3
"""
Generate MOTIF desktop & web icons (PNG + multi-resolution Windows ICO)
using pure Python supersampled SDF rendering (zero external dependencies).
"""

import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return lo if v < lo else (hi if v > hi else v)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def smoothstep(e0: float, e1: float, x: float) -> float:
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3.0 - 2.0 * t)


def sd_rounded_box(px: float, py: float, bx: float, by: float, r: float) -> float:
    qx = abs(px) - bx + r
    qy = abs(py) - by + r
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def sd_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay + 1e-12))
    return math.hypot(pax - bax * h, pay - bay * h)


def sd_motif_m(px: float, py: float) -> float:
    # Geometric editorial M centered slightly above middle
    # Stroke width ~ 0.072 in [-1, 1] coords
    stroke = 0.068
    left_x = -0.44
    right_x = 0.44
    top_y = -0.34
    bot_y = 0.34
    mid_y = 0.05

    d1 = sd_segment(px, py, left_x, bot_y, left_x, top_y) - stroke
    d2 = sd_segment(px, py, left_x, top_y, 0.0, mid_y) - stroke
    d3 = sd_segment(px, py, 0.0, mid_y, right_x, top_y) - stroke
    d4 = sd_segment(px, py, right_x, top_y, right_x, bot_y) - stroke
    return min(d1, d2, d3, d4)


def sample_pixel(u: float, v: float) -> tuple[float, float, float, float]:
    # u, v in [-1, 1]
    box_d = sd_rounded_box(u, v, 0.88, 0.88, 0.38)
    aa = 0.012
    alpha = 1.0 - smoothstep(-aa, aa, box_d)
    if alpha <= 0.001:
        return (0.0, 0.0, 0.0, 0.0)

    # Background vertical gradient: #2f7268 -> #21574f -> #16403c -> #0c2729
    ty = clamp((v + 0.88) / 1.76)
    if ty < 0.34:
        k = ty / 0.34
        r = lerp(47, 33, k)
        g = lerp(114, 87, k)
        b = lerp(104, 79, k)
    elif ty < 0.65:
        k = (ty - 0.34) / 0.31
        r = lerp(33, 22, k)
        g = lerp(87, 64, k)
        b = lerp(79, 60, k)
    else:
        k = (ty - 0.65) / 0.35
        r = lerp(22, 11, k)
        g = lerp(64, 36, k)
        b = lerp(60, 38, k)

    # Top-right mint radial glow
    dist_glow = math.hypot((u - 0.58) * 0.85, (v + 0.72) * 0.95)
    glow = (1.0 - smoothstep(0.0, 1.15, dist_glow)) * 0.38
    r = lerp(r, 126, glow)
    g = lerp(g, 200, glow)
    b = lerp(b, 186, glow)

    # Subtle layered mountain silhouette anchored near bottom
    ridge1 = 0.42 + 0.10 * math.sin(u * 2.4 + 0.4) + 0.06 * math.cos(u * 4.1)
    ridge2 = 0.58 + 0.08 * math.cos(u * 2.9 - 0.5)
    m1 = smoothstep(ridge1 - 0.02, ridge1 + 0.02, v)
    r = lerp(r, 14, m1 * 0.65)
    g = lerp(g, 48, m1 * 0.65)
    b = lerp(b, 46, m1 * 0.65)
    m2 = smoothstep(ridge2 - 0.02, ridge2 + 0.02, v)
    r = lerp(r, 8, m2 * 0.85)
    g = lerp(g, 33, m2 * 0.85)
    b = lerp(b, 32, m2 * 0.85)

    # Specular liquid glass top highlight sheen
    sheen = (1.0 - smoothstep(-0.88, -0.10, v)) * 0.12
    r = lerp(r, 255, sheen)
    g = lerp(g, 255, sheen)
    b = lerp(b, 255, sheen)

    # Crisp glass inner rim
    rim_band = (1.0 - smoothstep(0.0, 0.032, abs(box_d + 0.022)))
    rim_top = lerp(0.14, 0.46, clamp((0.88 - v) / 1.76))
    r = lerp(r, 224, rim_band * rim_top)
    g = lerp(g, 248, rim_band * rim_top)
    b = lerp(b, 243, rim_band * rim_top)

    # Subtle drop shadow behind the M monogram
    dm_shadow = sd_motif_m(u, v - 0.045)
    shadow = (1.0 - smoothstep(-0.02, 0.08, dm_shadow)) * 0.34
    r *= (1.0 - shadow)
    g *= (1.0 - shadow)
    b *= (1.0 - shadow)

    # Crisp M monogram in pearl-white -> mint gradient
    dm = sd_motif_m(u, v)
    m_cov = 1.0 - smoothstep(-0.011, 0.011, dm)
    if m_cov > 0.0:
        mt = clamp((v + 0.42) / 0.84)
        mr = lerp(246, 159, mt)
        mg = lerp(253, 216, mt)
        mb = lerp(251, 205, mt)
        r = lerp(r, mr, m_cov)
        g = lerp(g, mg, m_cov)
        b = lerp(b, mb, m_cov)

    # Luminous mint accent dot below the center vertex (playhead spark)
    dot_d = math.hypot(u, v - 0.33) - 0.068
    dot_cov = 1.0 - smoothstep(-0.011, 0.011, dot_d)
    if dot_cov > 0.0:
        r = lerp(r, 159, dot_cov)
        g = lerp(g, 216, dot_cov)
        b = lerp(b, 205, dot_cov)

    return (clamp(r / 255.0), clamp(g / 255.0), clamp(b / 255.0), alpha)


def render_rgba(size: int, ss: int = 2) -> bytes:
    out = bytearray(size * size * 4)
    inv_s = 1.0 / (size * ss)
    inv_ss2 = 1.0 / (ss * ss)
    idx = 0
    for y in range(size):
        for x in range(size):
            ar = ag = ab = aa = 0.0
            for sy in range(ss):
                v = ((y * ss + sy + 0.5) * inv_s) * 2.0 - 1.0
                for sx in range(ss):
                    u = ((x * ss + sx + 0.5) * inv_s) * 2.0 - 1.0
                    r, g, b, a = sample_pixel(u, v)
                    ar += r * a
                    ag += g * a
                    ab += b * a
                    aa += a
            aa *= inv_ss2
            if aa > 1e-6:
                ar = (ar * inv_ss2) / aa
                ag = (ag * inv_ss2) / aa
                ab = (ab * inv_ss2) / aa
            else:
                ar = ag = ab = 0.0
            out[idx] = int(round(clamp(ar) * 255))
            out[idx + 1] = int(round(clamp(ag) * 255))
            out[idx + 2] = int(round(clamp(ab) * 255))
            out[idx + 3] = int(round(clamp(aa) * 255))
            idx += 4
    return bytes(out)


def encode_png(size: int, rgba: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # Filter type 0 (None)
        raw.extend(rgba[y * stride : (y + 1) * stride])

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    compressed = zlib.compress(bytes(raw), level=9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def encode_ico(images: list[tuple[int, bytes]]) -> bytes:
    # PNG-compressed ICO (supported since Windows Vista / Windows 10 / 11)
    header = struct.pack("<HHH", 0, 1, len(images))
    entries = bytearray()
    offset = 6 + 16 * len(images)
    payload = bytearray()
    for size, png in images:
        dim = 0 if size >= 256 else size
        entries.extend(
            struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset)
        )
        offset += len(png)
        payload.extend(png)
    return header + bytes(entries) + bytes(payload)


def write_bytes(rel_path: str, data: bytes) -> None:
    full = os.path.join(ROOT, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as f:
        f.write(data)
    print(f"wrote {rel_path} ({len(data):,} bytes)")


def main() -> None:
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_pngs: list[tuple[int, bytes]] = []
    for sz in ico_sizes:
        ss = 3 if sz <= 64 else 2
        png = encode_png(sz, render_rgba(sz, ss=ss))
        ico_pngs.append((sz, png))
        if sz == 32:
            write_bytes("public/favicon.png", png)
        if sz == 256:
            write_bytes("build/icon-256.png", png)

    # High-res 512x512 icon
    png_512 = encode_png(512, render_rgba(512, ss=2))
    write_bytes("build/icon.png", png_512)
    write_bytes("public/icon-512.png", png_512)

    # Multi-resolution Windows ICO
    ico_data = encode_ico(ico_pngs)
    write_bytes("build/icon.ico", ico_data)
    write_bytes("public/favicon.ico", ico_data)


if __name__ == "__main__":
    main()
