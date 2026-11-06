"""Genera le icone PNG dell'app senza librerie esterne: python tools/make_icons.py

Sfondo autunnale (ambra -> zucca -> bordeaux) con una ciambella a tre segmenti
colorati e un riflesso di vetro in alto.
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

# Gradiente diagonale dello sfondo.
STOPS = [(0.0, (250, 178, 64)), (0.5, (226, 96, 40)), (1.0, (138, 36, 56))]
# Segmenti della ciambella: (inizio, fine) in gradi da ore 12, colore.
SEGMENTS = [
    (6, 172, (255, 246, 230)),   # crema
    (182, 272, (255, 203, 69)),  # oro
    (282, 354, (167, 205, 92)),  # verde foglia
]


def write_png(path, w, h, rgba):
    raw = b"".join(b"\x00" + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def clamp(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def gradient(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            return mix(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]


def render(size, rounded):
    buf = bytearray(size * size * 4)
    cx = cy = size / 2
    r_out = 0.305 * size
    r_in = 0.175 * size
    corner = 0.225 * size
    for y in range(size):
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            col = gradient(clamp((px * 0.8 + py * 1.2) / (2 * size)))

            # Ombra morbida sotto la ciambella.
            dxs, dys = px - cx, py - cy - size * 0.02
            ds = math.hypot(dxs, dys)
            shade = clamp(1 - abs(ds - (r_in + r_out) / 2) / (size * 0.12)) * 0.18
            col = mix(col, (90, 20, 20), shade)

            dx, dy = px - cx, py - cy
            d = math.hypot(dx, dy)
            cov = clamp(min(d - r_in, r_out - d) + 0.5)
            if cov > 0:
                ang = math.degrees(math.atan2(dx, -dy)) % 360
                for s, e, c in SEGMENTS:
                    if s <= ang <= e:
                        edge = math.radians(min(ang - s, e - ang)) * d
                        a = cov * clamp(edge + 0.5)
                        # leggero chiaroscuro sul segmento per dare volume
                        vol = 1 - 0.1 * clamp((d - r_in) / (r_out - r_in))
                        col = mix(col, tuple(ch * vol for ch in c), a)
                        break

            # Riflesso di vetro: ellisse luminosa in alto.
            gx, gy = (px - cx) / (size * 0.62), (py - size * 0.06) / (size * 0.36)
            g = clamp(1 - math.hypot(gx, gy)) ** 1.6 * 0.32
            col = mix(col, (255, 255, 255), g)

            a = 1.0
            if rounded:
                qx = max(abs(px - cx) - (size / 2 - corner), 0)
                qy = max(abs(py - cy) - (size / 2 - corner), 0)
                a = clamp(corner - math.hypot(qx, qy) + 0.5)
            i = (y * size + x) * 4
            buf[i:i + 4] = bytes((round(col[0]), round(col[1]), round(col[2]), round(a * 255)))
    return buf


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size, rounded in [
        ("apple-touch-icon.png", 180, False),  # iOS arrotonda da solo
        ("icon-192.png", 192, True),
        ("icon-512.png", 512, True),
        ("icon-maskable-512.png", 512, False),
    ]:
        write_png(os.path.join(OUT, name), size, size, render(size, rounded))
        print("creata", name)


if __name__ == "__main__":
    main()
