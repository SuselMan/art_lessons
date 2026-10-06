#!/usr/bin/env python3
"""A sheet's strokes laid out for a Grafetto room, to paint the same strokes
beside them (#536).

  board.py <sheet> [out.jpg]

One image the size of an A2 room turned landscape (3508 x 2480 px): a row per
stroke - the stroke just painted, the stroke dry, and an empty frame of the
same size for the repeat. Imported into the room (Layers -> import image) a
fixed-size room stretches an image over the whole sheet, so an image of the
sheet's own size lands pixel for pixel.

The scale is the paper's own where it fits: a room's A-sizes are 150 dpi,
5.9 px per mm, the same as A4 - a stroke 2 cm wide is 118 px, inside the
watercolour brush's 200. A sheet with more rows than fit is laid in two
groups side by side and, if still too big, scaled down; the scale is written
on the board, the comparison reads it back from archive.json (`board`).
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
import refs  # noqa: E402

W, H = 3508, 2480
ROOM_PX_PER_MM = W / 594  # A2 landscape at 150 dpi
GAP_MM, MARGIN_MM, TITLE_MM = 6, 12, 14


def font(px):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/TTF/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    return ImageFont.load_default()


def layout(strokes, groups):
    """Rows per group, and the board's size in mm at scale 1."""
    per = -(-len(strokes) // groups)
    cols = [strokes[i * per:(i + 1) * per] for i in range(groups)]
    wmm = max((st['wet'][0] if st['wet'] else st['dry'])['w'] for st in strokes) / refs.PX_PER_MM
    col_w = 3 * wmm + 3 * GAP_MM + 10  # 10 mm for the number
    height = max(sum(max((st['wet'][0] if st['wet'] else st['dry'])['h'], (st['dry'] or st['wet'][-1])['h']) / refs.PX_PER_MM + GAP_MM for st in c) for c in cols)
    return cols, wmm, groups * col_w, height


def main(sid, out=None):
    a = refs.load()
    sheet = refs.sheet_of(a, sid)
    strokes = [st for st in sheet['strokes'] if st['wet'] or st.get('dry')]
    avail_w, avail_h = 594 - 2 * MARGIN_MM, 420 - 2 * MARGIN_MM - TITLE_MM
    if not strokes:
        raise ValueError('Sheet has no wet or dry reference images')
    best = None
    for groups in (1, 2, 3):
        cols, wmm, bw, bh = layout(strokes, groups)
        s = min(1.0, avail_w / bw, avail_h / bh)
        if best is None or s > best[0] + 1e-6:
            best = (s, cols, wmm)
    s, cols, wmm = best
    k = ROOM_PX_PER_MM * s  # board px per mm
    board = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(board)
    m = round(MARGIN_MM * ROOM_PX_PER_MM)
    scale = '1:1 с листом' if s == 1 else f'масштаб {s:.2f} от листа'
    caption = 'слева и в середине сухой образец, справа — повторить' if all(not st['wet'] for st in strokes) else 'слева сразу после мазка, в середине сухой, справа — повторить'
    d.text((m, m - round(4 * ROOM_PX_PER_MM)), f'Лист {sid} · {scale} · {caption}',
           fill=(90, 90, 90), font=font(round(5 * ROOM_PX_PER_MM)))
    if sheet.get('note'):
        d.text((m, m + round(3 * ROOM_PX_PER_MM)), sheet['note'], fill=(140, 140, 140), font=font(round(4 * ROOM_PX_PER_MM)))
    y0 = m + round(TITLE_MM * ROOM_PX_PER_MM)
    col_w = (3 * wmm + 3 * GAP_MM + 10) * k
    slots = {}
    for g, col in enumerate(cols):
        x = m + g * col_w
        y = y0
        for st in col:
            first = Image.open(os.path.join(refs.ROOT, (st['wet'][0] if st['wet'] else st['dry'])['src']))
            dry = Image.open(os.path.join(refs.ROOT, (st['dry'] or st['wet'][-1])['src']))
            f = k / refs.PX_PER_MM
            first = first.resize((round(first.width * f), round(first.height * f)), Image.LANCZOS)
            dry = dry.resize((round(dry.width * f), round(dry.height * f)), Image.LANCZOS)
            d.text((x, y + first.height // 2 - 20), str(st['n']), fill=(60, 60, 160), font=font(round(7 * ROOM_PX_PER_MM)))
            xa = x + round(10 * k)
            board.paste(first, (int(xa), int(y)))
            xb = xa + round((wmm + GAP_MM) * k)
            board.paste(dry, (int(xb), int(y)))
            xc = xb + round((wmm + GAP_MM) * k)
            # The empty frame: dashed, light, the dry shot's size.
            fw, fh = dry.width, dry.height
            for i in range(0, fw, 24):
                d.line([(xc + i, y), (xc + min(i + 12, fw), y)], fill=(200, 200, 200), width=2)
                d.line([(xc + i, y + fh), (xc + min(i + 12, fw), y + fh)], fill=(200, 200, 200), width=2)
            for i in range(0, fh, 24):
                d.line([(xc, y + i), (xc, y + min(i + 12, fh))], fill=(200, 200, 200), width=2)
                d.line([(xc + fw, y + i), (xc + fw, y + min(i + 12, fh))], fill=(200, 200, 200), width=2)
            slots[str(st['n'])] = [int(xc), int(y), int(xc + fw), int(y + fh)]
            y += max(first.height, dry.height) + round(GAP_MM * k)
    out = out or os.path.join(refs.ROOT, 'boards', f'{sid}.jpg')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    board.save(out, quality=86)
    # Where each repeat goes, in room pixels - for cutting the replay later.
    sheet['board'] = {'src': refs.rel(out), 'roomPx': [W, H], 'pxPerMm': round(k, 4), 'slots': slots}
    refs.save(a)
    print(out, f'scale {s:.2f}', f'{os.path.getsize(out) / 1e6:.1f} MB')


if __name__ == '__main__':
    main(*sys.argv[1:])
