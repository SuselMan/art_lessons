"""The blur test agreed in the thread: blur ours and the reference by 6 px;
if ours still does not read as watercolour, the error is macro/meso, not grain.
usage: python3 blurtest.py <ours.png> <crop x0,y0,x1,y1> <ref.jpg> <out.png> [scale]
"""
import sys, math
from PIL import Image, ImageFilter, ImageDraw, ImageFont
ours = Image.open(sys.argv[1]).convert('RGB')
x0, y0, x1, y1 = map(int, sys.argv[2].split(','))
ours = ours.crop((x0, y0, x1, y1))
ref = Image.open(sys.argv[3]).convert('RGB')
out = sys.argv[4]
scale = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
if scale != 1.0:
    ours = ours.resize((int(ours.width * scale), int(ours.height * scale)), Image.LANCZOS)
W, H = 520, 340
def fit(im):
    im = im.copy(); im.thumbnail((W, H)); o = Image.new('RGB', (W, H), 'white'); o.paste(im, ((W - im.width) // 2, (H - im.height) // 2)); return o
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
rows = [('as is', fit(ours), fit(ref)), ('blur 6 px', fit(ours).filter(ImageFilter.GaussianBlur(6)), fit(ref).filter(ImageFilter.GaussianBlur(6)))]
sheet = Image.new('RGB', (W * 2 + 30, (H + 30) * 2 + 10), 'white'); d = ImageDraw.Draw(sheet)
for i, (t, a, b) in enumerate(rows):
    y = i * (H + 30) + 8; d.text((12, y), t + ' — ours | reference', fill='black', font=font)
    sheet.paste(a, (10, y + 20)); sheet.paste(b, (W + 20, y + 20))
sheet.save(out); print(out, sheet.size)
