import sys, os, hashlib
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
names = sorted(f for f in os.listdir(a) if f.endswith('.png'))
for n in names:
    pa, pb = os.path.join(a, n), os.path.join(b, n)
    if not os.path.exists(pb):
        print(f'{n:45s} MISSING in {b}'); continue
    ba, bb = open(pa, 'rb').read(), open(pb, 'rb').read()
    if ba == bb:
        print(f'{n:45s} bytes-identical'); continue
    ia, ib = Image.open(pa).convert('RGBA'), Image.open(pb).convert('RGBA')
    if ia.size != ib.size:
        print(f'{n:45s} SIZE {ia.size} vs {ib.size}'); continue
    d = ImageChops.difference(ia, ib)
    bands = d.split()
    mx = max(bd.getextrema()[1] for bd in bands)
    m = ImageChops.lighter(ImageChops.lighter(bands[0], bands[1]), ImageChops.lighter(bands[2], bands[3]))
    cnt = sum(1 for v in m.getdata() if v)
    bbox = m.getbbox()
    print(f'{n:45s} pixels-{"identical (encoding differs)" if mx == 0 else "DIFF"} max={mx} count={cnt}/{ia.size[0]*ia.size[1]} bbox={bbox}')
