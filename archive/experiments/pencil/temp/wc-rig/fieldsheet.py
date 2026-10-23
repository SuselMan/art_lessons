"""Sheet of the field dump: each channel as a grey image with its own gain, labelled."""
import sys, glob, os, numpy as np
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1]; out = sys.argv[2]; names = sys.argv[3].split(',')
crop = [int(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 else None
scale = float(sys.argv[5]) if len(sys.argv) > 5 else 1
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
tiles = []
for n in names:
    p = os.path.join(d, n + '.pgm')
    im = Image.open(p)
    a = np.asarray(im).astype(float)
    if crop: a = a[crop[1]:crop[3], crop[0]:crop[2]]
    mx = max(a.max(), 1)
    g = Image.fromarray((255 - a / mx * 255).astype(np.uint8))
    if scale != 1: g = g.resize((int(g.width * scale), int(g.height * scale)), Image.NEAREST)
    tiles.append((f'{n} max {int(mx)}', g))
W = max(t.width for _, t in tiles); H = max(t.height for _, t in tiles)
cols = min(3, len(tiles)); rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('L', (cols * (W + 8), rows * (H + 18)), 255); dr = ImageDraw.Draw(sheet)
for i, (lab, t) in enumerate(tiles):
    x = (i % cols) * (W + 8); y = (i // cols) * (H + 18)
    dr.text((x + 2, y), lab, fill=0, font=font); sheet.paste(t, (x, y + 16))
sheet.save(out); print(out, sheet.size)
