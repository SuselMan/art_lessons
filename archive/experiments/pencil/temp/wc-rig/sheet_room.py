"""Sheet: our clean re-render of Ilya's room P2uLmpGw (one layer per series) against the photo
crops. Usage: python3 sheet_room.py <replay dir with layer_N.png> <out.png> [title]"""
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
d, out = sys.argv[1], sys.argv[2]
title = sys.argv[3] if len(sys.argv) > 3 else ''
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
labels = ['1: much water, much pigment', '2: much water, little pigment', '3: medium water, much pigment',
          '4: left: water dab into damp wash; right: paint dab into clean water', '5: two colours wet-on-wet',
          '6: little water, much pigment, different speeds']
COL = 650
rows = []
for i in range(1, 7):
    im = Image.open(f'{d}/layer_{i}.png').convert('RGB')
    a = np.asarray(im).astype(int)
    paper = np.median(a[::8, ::8].reshape(-1, 3), axis=0)
    diff = np.abs(a - paper).sum(axis=2)
    ys, xs = np.nonzero(diff > 60)
    m = 40
    x0, x1 = max(0, xs.min() - m), min(im.width, xs.max() + m)
    y0, y1 = max(0, ys.min() - m), min(im.height, ys.max() + m)
    ours = im.crop((x0, y0, x1, y1))
    photo = Image.open(f'/home/suselman/projects/pencil/temp/wc-out/photos/photo_{i}.png').convert('RGB')
    # both columns COL wide, each scaled to fit
    s = COL / ours.width
    ours = ours.resize((COL, int(ours.height * s)), Image.LANCZOS)
    s2 = COL / photo.width
    photo = photo.resize((COL, int(photo.height * s2)), Image.LANCZOS)
    rows.append((labels[i - 1], ours, photo))
H = 30 + sum(max(o.height, p.height) + 30 for _, o, p in rows)
sheet = Image.new('RGB', (2 * COL + 30, H), 'white')
dr = ImageDraw.Draw(sheet)
y = 6
dr.text((10, y), title + '  |  left: ours (clean re-render of the room log)  |  right: photo', fill='black', font=font)
y += 24
for lab, o, p in rows:
    dr.text((10, y), lab, fill='black', font=font)
    sheet.paste(o, (10, y + 20)); sheet.paste(p, (COL + 20, y + 20))
    y += max(o.height, p.height) + 30
sheet.save(out); print(out, sheet.size)
