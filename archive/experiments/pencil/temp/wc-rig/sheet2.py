"""Round-2 sheet for the thread: blot, long stroke, drop into a light and a dense wash, the photo, at one scale."""
import sys
from PIL import Image, ImageDraw, ImageFont
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
blot, longs, light, dense, out = sys.argv[1:6]
tiles = [
  ('tideline: blot, brush 60, 100:100', Image.open(blot).crop((440,420,840,580))),
  ('tideline: long stroke, brush 60', Image.open(longs).crop((180,440,800,560))),
  ('bloom: water 140 px into damp wash 100:60, +20 s', Image.open(light).crop((486,296,726,506))),
  ('bloom: same into wash 100:100, +20 s', Image.open(dense).crop((486,296,726,506))),
  ('photo bloom_wa_drop, same scale', Image.open('photo_drop_crop.png')),
]
W = max(t.width for _, t in tiles) * 2 + 20
y = 10; rows = []
for lab, im in tiles:
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS); rows.append((lab, im)); y += im.height + 34
sheet = Image.new('RGB', (W, y), 'white'); d = ImageDraw.Draw(sheet); y = 10
for lab, im in rows:
    d.text((10, y), lab, fill='black', font=font); sheet.paste(im, (10, y + 22)); y += im.height + 34
sheet.save(out); print(out, sheet.size)
