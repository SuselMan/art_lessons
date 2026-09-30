#!/usr/bin/env python3
"""Contact sheet: sheet.py out.png [--h 360] [--crop x0,y0,x1,y1] label=path ...
Each image is scaled to the same height and labelled underneath. A path may be
suffixed with @x0,y0,x1,y1 to crop it first."""
import sys
from PIL import Image, ImageDraw, ImageFont

args = sys.argv[1:]
out = args.pop(0)
H = 360
cols = 4
while args and args[0].startswith('--'):
    k = args.pop(0)
    if k == '--h':
        H = int(args.pop(0))
    elif k == '--cols':
        cols = int(args.pop(0))

tiles = []
for a in args:
    label, path = a.split('=', 1) if '=' in a else (a, a)
    crop = None
    if '@' in path:
        path, c = path.rsplit('@', 1)
        crop = tuple(int(v) for v in c.split(','))
    im = Image.open(path).convert('RGB')
    if crop:
        im = im.crop(crop)
    w = round(im.width * H / im.height)
    tiles.append((label, im.resize((w, H), Image.LANCZOS)))

try:
    font = ImageFont.truetype('DejaVuSans.ttf', 16)
except OSError:
    font = ImageFont.load_default()
rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
W = max(sum(t.width for _, t in r) + 10 * (len(r) + 1) for r in rows)
sheet = Image.new('RGB', (W, len(rows) * (H + 36) + 10), 'white')
d = ImageDraw.Draw(sheet)
y = 10
for r in rows:
    x = 10
    for label, t in r:
        sheet.paste(t, (x, y))
        d.text((x, y + H + 6), label, fill='black', font=font)
        x += t.width + 10
    y += H + 36
sheet.save(out)
print(out, sheet.size)
