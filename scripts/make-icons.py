# Generates extension/icons/*.png (a white tray on an indigo tile). Requires Pillow.
from PIL import Image, ImageDraw
S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([16, 16, S - 16, S - 16], radius=112, fill=(91, 91, 214, 255))
w = 34
# tray outline: open box with an inbox notch
pts = [(112, 250), (112, 384), (400, 384), (400, 250)]
d.line(pts, fill="white", width=w, joint="curve")
d.line([(112, 250), (196, 250), (220, 300), (292, 300), (316, 250), (400, 250)], fill="white", width=w, joint="curve")
# ad card dropping into the tray
d.rounded_rectangle([176, 112, 336, 222], radius=18, outline="white", width=26)
d.text((0, 0), "", fill="white")
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(f"extension/icons/icon{size}.png")
img.save("extension/icons/icon512.png")
