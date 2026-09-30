#!/usr/bin/env python3
"""Every stroke of every wet photo of one sheet, into the archive (#536).

  sheet.py <spec.json>

The spec names the sheet, and for each photo: the file, its scale (a coin's
diameter, `coin: [x0, y0, x1, y1]`, or any segment of known length, `ref`
and `refMm`), and for each stroke number a point somewhere on that stroke,
`seeds: {"7": [x, y]}`, in the coordinates of a preview `displayWidth` wide.

A stroke is found as the paint-coloured region around its seed (the paint is
told from the paper and from the ink of the labels by colour). Its box is the
same size in millimetres in every photo - the largest the stroke is anywhere
in the series, plus a margin - and centred on the stroke, so the viewer's
slider shows it drying rather than jumping. The sheet's wet series are
rebuilt from scratch on every run; dry shots are left alone.
"""
import json
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import refs  # noqa: E402

MARGIN_MM = 4
WORK_WIDTH = 1000  # the mask is searched at about this width


def paint_mask(rgb):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    # Pale washes too: a light lavender is only ~20 above the paper in blue.
    return (b - g > 18) & (r - g > 8)


def region(mask, seed):
    """The connected region of `mask` nearest `seed`, as (x0, y0, x1, y1)."""
    h, w = mask.shape
    sx, sy = seed
    ys, xs = np.nonzero(mask)
    i = int(np.argmin((xs - sx) ** 2 + (ys - sy) ** 2))
    start = (int(ys[i]), int(xs[i]))
    seen = np.zeros_like(mask, dtype=bool)
    seen[start] = True
    q = deque([start])
    x0 = x1 = start[1]
    y0 = y1 = start[0]
    while q:
        y, x = q.popleft()
        x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return x0, y0, x1 + 1, y1 + 1


def coin_mask(rgb):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return (r > 110) & (g > 80) & (r - b > 50) & (g - b > 25)


def scale(photo, im=None):
    if 'coinAt' in photo:
        # The coin found around a point of the preview: its box's mean side.
        W, H = im.size
        d = W / photo.get('displayWidth', 2000)
        cx, cy = photo['coinAt'][0] * d, photo['coinAt'][1] * d
        half = int(0.06 * W)
        x0, y0 = max(0, int(cx - half)), max(0, int(cy - half))
        win = np.asarray(im.crop((x0, y0, int(cx + half), int(cy + half))))
        # Grown first: the relief's shadows fail the colour test and split the
        # coin into islands; the region would be one of them.
        m = np.asarray(Image.fromarray((coin_mask(win) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15))) > 0
        bx0, by0, bx1, by1 = region(m, (cx - x0, cy - y0))
        bx0, by0, bx1, by1 = bx0 + 7, by0 + 7, bx1 - 7, by1 - 7  # the growth back off
        photo['coinPx'] = ((bx1 - bx0) + (by1 - by0)) / 2
        return photo['coinPx'] / refs.COINS_MM[photo['coinKind']]
    if 'coin' in photo:
        x0, y0, x1, y1 = photo['coin']
        return math.hypot(x1 - x0, y1 - y0) / refs.COINS_MM[photo['coinKind']]
    x0, y0, x1, y1 = photo['ref']
    return math.hypot(x1 - x0, y1 - y0) / photo['refMm']


def main(spec_path):
    spec = json.load(open(spec_path, encoding='utf-8'))
    a = refs.load()
    sheet = refs.sheet_of(a, spec['sheet'])
    frames = {}  # n -> [(photo, t, px_per_mm, (cx, cy) px, (w, h) mm)]
    for photo in spec['photos']:
        photo.setdefault('coinKind', sheet['coin'])
        im, t = refs.open_photo(photo['file'])
        if photo.get('rotate'):
            # Counter-clockwise, degrees: the sheet photographed turned.
            im = im.rotate(photo['rotate'], expand=True)
        W, H = im.size
        f = max(1, W // WORK_WIDTH)
        small = np.asarray(im.resize((W // f, H // f), Image.BILINEAR))
        m = paint_mask(small)
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        k = scale(photo, im)
        print(os.path.basename(photo['file']), f'{k:.2f} px/mm', f"coin {photo['coinPx']:.0f} px" if 'coinPx' in photo else '')
        d = W / photo.get('displayWidth', 2000)
        for n, (sx, sy) in photo['seeds'].items():
            x0, y0, x1, y1 = region(m, (sx * d / f, sy * d / f))
            x0, y0, x1, y1 = x0 * f, y0 * f, x1 * f, y1 * f
            frames.setdefault(int(n), []).append(
                (photo, im, t, k, ((x0 + x1) / 2, (y0 + y1) / 2), ((x1 - x0) / k, (y1 - y0) / k)))
    for st in sheet['strokes']:
        for w in st['wet']:
            p = os.path.join(refs.ROOT, w['src'])
            if os.path.exists(p):
                os.remove(p)
        st['wet'] = []
    for n, fr in sorted(frames.items()):
        # A drop into clear water: the paint is a speck in a puddle the photo
        # does not show - `minBoxMm` keeps the puddle (and the bloom to come)
        # in the frame.
        mw, mh = spec.get('minBoxMm', (0, 0))
        wmm = max(max(x[5][0] for x in fr) + 2 * MARGIN_MM, mw)
        hmm = max(max(x[5][1] for x in fr) + 2 * MARGIN_MM, mh)
        st = refs.stroke_of(sheet, n)
        first = None
        for i, (photo, im, t, k, (cx, cy), _) in enumerate(sorted(fr, key=lambda x: x[2] or ''), 1):
            box = (cx - wmm * k / 2, cy - hmm * k / 2, cx + wmm * k / 2, cy + hmm * k / 2)
            out = os.path.join(refs.ROOT, 'img', sheet['id'], f'{n:03d}-wet-{i:02d}.jpg')
            w, h = refs.cut(im, box, k, out)
            first = first or t
            age = (np.datetime64(t) - np.datetime64(first)).astype('timedelta64[s]').astype(int).item() if t and first else None
            st['wet'].append({'src': refs.rel(out), 't': t, 'ageS': age, 'w': w, 'h': h, 'photo': os.path.basename(photo['file'])})
        print(n, f'{len(fr)} frames', f'{wmm:.0f}x{hmm:.0f} mm')
    refs.save(a)


if __name__ == '__main__':
    main(sys.argv[1])
