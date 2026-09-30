#!/usr/bin/env python3
"""Side-by-side sheets: sandbox vs photos vs the current tool.

compare.py <runs dir> <out dir>
  <runs dir>/all1024, ilya1024, bloom1024 — outputs of `shoot.mjs shots`
Photos come from the main checkout's temp/watercolor-ref and temp/wc-out/photos,
the current tool from temp/wc-round7-vs-photos.png (its left column is a clean
re-render of Ilya's room with the room's engine, same series as the photos)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

runs, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
T = Path('/home/suselman/projects/pencil/temp')
REF = T / 'watercolor-ref'
PH = T / 'wc-out' / 'photos'
R7 = T / 'wc-round7-vs-photos.png'
try:
    FONT = ImageFont.truetype('DejaVuSans.ttf', 17)
    BIG = ImageFont.truetype('DejaVuSans-Bold.ttf', 22)
except OSError:
    FONT = BIG = ImageFont.load_default()


def crop(path, box=None):
    im = Image.open(path).convert('RGB')
    return im.crop(box) if box else im


# 'all' script panels on the 1024 canvas: 3 columns × 2 rows
def panel(c, r, name='final'):
    return crop(runs / 'all1024' / f'{name}.png', (c * 341, r * 512, (c + 1) * 341, (r + 1) * 512))


# 'ilya' cells: 2 columns × 3 rows
def cell(c, r, name='final'):
    return crop(runs / 'ilya1024' / f'{name}.png', (c * 512 + 20, r * 341 + 10, (c + 1) * 512 - 20, (r + 1) * 341 - 10))


# the current tool, left column of round 7 (coordinates in the original sheet)
R7_BOX = {1: (8, 49, 661, 577), 2: (8, 607, 661, 1074), 4: (8, 1604, 661, 1850), 5: (8, 2053, 661, 2309), 6: (8, 2534, 661, 3272)}


def current(series):
    return crop(R7, R7_BOX[series])


def row(title, tiles, H=300):
    """tiles: list of (label, image)"""
    scaled = []
    for l, im in tiles:
        im = im.resize((max(1, round(im.width * H / im.height)), H), Image.LANCZOS)
        if im.width < 340:  # leave room for the caption
            pad = Image.new('RGB', (340, H), 'white')
            pad.paste(im, ((340 - im.width) // 2, 0))
            im = pad
        scaled.append((l, im))
    W = sum(t.width for _, t in scaled) + 12 * (len(scaled) + 1)
    img = Image.new('RGB', (W, H + 72), 'white')
    d = ImageDraw.Draw(img)
    d.text((12, 6), title, fill='black', font=BIG)
    x = 12
    for l, t in scaled:
        img.paste(t, (x, 38))
        d.text((x, 38 + H + 6), l, fill='#333', font=FONT)
        x += t.width + 12
    return img


def stack(rows, path):
    W = max(r.width for r in rows)
    img = Image.new('RGB', (W, sum(r.height for r in rows) + 10), 'white')
    y = 0
    for r in rows:
        img.paste(r, (0, y))
        y += r.height
    img.save(path)
    print(path, img.size)


rows = {
    'edge': row('Кромка одиночного залива (тайдлайн)', [
        ('песочница: лужа сохнет сама', panel(0, 0)),
        ('песочница: мазки, много воды', cell(0, 0)),
        ('текущий инструмент (раунд 7)', current(1)),
        ('фото: edge_ldm_grey', crop(REF / 'edge/edge_ldm_grey.jpg')),
        ('фото Ильи, серия 1', crop(PH / 'photo_1.png')),
    ]),
    'wet': row('По-мокрому (wet-in-wet)', [
        ('песочница: жёлтый + ультрамарин', panel(1, 0)),
        ('песочница: серия 5 Ильи', cell(0, 2)),
        ('текущий инструмент (раунд 7)', current(5)),
        ('фото Ильи, серия 5', crop(PH / 'photo_5.png')),
        ('фото: wet_wa_colors', crop(REF / 'wet/wet_wa_colors.jpg')),
    ]),
    'bloom': row('Блюм: вода в полусухой залив', [
        ('песочница: панель 3', panel(2, 0)),
        ('песочница: крупно', crop(runs / 'bloom1024' / 'final.png', (250, 250, 774, 774))),
        ('песочница: серия 4 Ильи', cell(1, 1)),
        ('текущий инструмент (раунд 7)', current(4)),
        ('фото: bloom_wa_drop', crop(REF / 'bloom/bloom_wa_drop.jpg')),
        ('фото: bloom_sf_2629', crop(REF / 'bloom/bloom_sf_2629.jpg')),
    ]),
    'glaze': row('Лессировка по высохшему', [
        ('песочница: жёлтый, сверху роза и ультрамарин', panel(0, 1)),
        ('фото: wet_wa_glaze', crop(REF / 'wet/wet_wa_glaze.jpg')),
    ]),
    'dry': row('Сухая кисть', [
        ('песочница: панель 5', panel(1, 1)),
        ('песочница: серия 6 Ильи', cell(1, 2)),
        ('текущий инструмент (раунд 7)', current(6)),
        ('фото Ильи, серия 6', crop(PH / 'photo_6.png')),
        ('фото: dry_wa_how', crop(REF / 'dry/dry_wa_how.jpg')),
    ]),
    'gran': row('Гранулянция', [
        ('песочница: ультрамарин / инд. красная', panel(2, 1)),
        ('фото: ультрамарин', crop(REF / 'gran/gran_wa_ultra.jpg')),
        ('фото: жжёная сиена', crop(REF / 'gran/gran_wa_bsienna.jpg')),
        ('фото: gran_wa_main', crop(REF / 'gran/gran_wa_main.jpg')),
    ]),
    'series2': row('Много воды, мало пигмента (серия 2 Ильи)', [
        ('песочница', cell(1, 0)),
        ('текущий инструмент (раунд 7)', current(2)),
        ('фото Ильи, серия 2', crop(PH / 'photo_2.png')),
    ]),
}
for k, r in rows.items():
    r.save(out / f'effect_{k}.png')
stack(list(rows.values()), out / 'all_effects.png')

# whole canvases, for context
for name in ['all1024/wet', 'all1024/final', 'ilya1024/final', 'bloom1024/final']:
    src = runs / f'{name}.png'
    if src.exists():
        Image.open(src).save(out / ('canvas_' + name.replace('/', '_') + '.png'))
