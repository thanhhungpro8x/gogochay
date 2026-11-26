# Generates extension/icons/*.png: a white tray with a leaf on a green tile. Requires Pillow.
from PIL import Image, ImageDraw
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([32, 32, S - 32, S - 32], radius=224, fill=(27, 127, 74, 255))
w = 68
# tray: open box with an inbox notch
d.line([(224, 500), (224, 768), (800, 768), (800, 500)], fill="white", width=w, joint="curve")
d.line([(224, 500), (392, 500), (440, 600), (584, 600), (632, 500), (800, 500)], fill="white", width=w, joint="curve")
# leaf dropping into the tray: pointed at both ends, with a stem and a vein
import math
ax, ay, bx, by = 450, 455, 640, 150          # base and tip of the leaf
dx, dy = bx - ax, by - ay
L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
pts_l, pts_r = [], []
for i in range(41):
    t = i / 40
    wdt = 95 * math.sin(math.pi * t) ** 0.9
    cx, cy = ax + dx * t, ay + dy * t
    pts_l.append((cx + nx * wdt, cy + ny * wdt)); pts_r.append((cx - nx * wdt, cy - ny * wdt))
d.polygon(pts_l + pts_r[::-1], fill="white")
d.line([(ax - 0.12 * dx, ay - 0.12 * dy), (ax, ay)], fill="white", width=26)        # stem
d.line([(ax + 0.08 * dx, ay + 0.08 * dy), (ax + 0.86 * dx, ay + 0.86 * dy)], fill=(27, 127, 74, 255), width=18)  # vein
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(f"extension/icons/icon{size}.png")
img.resize((512, 512), Image.LANCZOS).save("extension/icons/icon512.png")
