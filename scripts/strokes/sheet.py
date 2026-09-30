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
rebuilt from scratch on every run. The spec's `dry`, one photo in the same
form, gives each stroke its dry shot in the same box; without it the dry
shots already in the archive are left alone.
"""
import json
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import align  # noqa: E402
import refs  # noqa: E402

MARGIN_MM = 4
SHEET_PAD_MM = 15  # sheet around the strokes, for the sheet's registration
SHEET_PX = 3  # px/mm the sheets are registered at
MAX_MISS_MM = 4  # a sheet match that puts the strokes further off is not trusted
LOCAL_PAD_MM = 8  # sheet around a stroke for its local refinement
LOCAL_MAX_MM, LOCAL_MAX_DEG, LOCAL_MAX_SCALE = 2.0, 0.8, 0.012  # the most it may move
WORK_WIDTH = 1000  # the mask is searched at about this width


def paint_mask(rgb, bg=18, rg=8):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    # Pale washes too: a light lavender is only ~20 above the paper in blue.
    # A paler, pinker one (sheet 4) needs the spec's `paint: [bg, rg]`.
    return (b - g > bg) & (r - g > rg)


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


def sheet_transforms(photos, boxes, ref):
    """For each photo, the map (3x3) from the reference photo's sheet to its
    own pixels: every photo laid over the reference as a whole sheet.

    Registered stroke by stroke, a frame is matched on the one stroke, and a
    drop blooming into a puddle looks like nothing it looked like a minute
    before: sheet 3 jumped by 7 mm. The sheet holds still: all its strokes,
    most of them dry or nearly, together outvote the one that is changing.

    Each photo's part of the sheet (the reference's stroke boxes with SHEET_PAD_MM
    around) is cut at SHEET_PX px/mm and aligned (align.py) onto the
    reference's. `boxes[p]` is {n: (cx, cy, w_mm, h_mm)} in photo p's pixels."""
    rk = ref['k']
    rb = boxes[id(ref)]
    xs = [cx for cx, cy, w, h in rb.values()]
    ys = [cy for cx, cy, w, h in rb.values()]
    x0 = min(cx - w * rk / 2 for cx, cy, w, h in rb.values()) - SHEET_PAD_MM * rk
    x1 = max(cx + w * rk / 2 for cx, cy, w, h in rb.values()) + SHEET_PAD_MM * rk
    y0 = min(cy - h * rk / 2 for cx, cy, w, h in rb.values()) - SHEET_PAD_MM * rk
    y1 = max(cy + h * rk / 2 for cx, cy, w, h in rb.values()) + SHEET_PAD_MM * rk
    wmm, hmm = (x1 - x0) / rk, (y1 - y0) / rk
    G = SHEET_PX
    size = (round(wmm * G), round(hmm * G))

    def roi(photo):
        # The same stretch of sheet in `photo`: where its strokes are, shifted
        # as the reference's box is from the reference's strokes.
        b = boxes[id(photo)]
        common = [n for n in b if n in rb]
        k = photo['k']
        mx = np.mean([b[n][0] for n in common]) - np.mean([rb[n][0] for n in common]) * k / rk
        my = np.mean([b[n][1] for n in common]) - np.mean([rb[n][1] for n in common]) * k / rk
        ox, oy = mx + x0 * k / rk, my + y0 * k / rk
        crop = photo['im'].crop((int(ox), int(oy), int(ox + wmm * k), int(oy + hmm * k))).resize(size, Image.BILINEAR)
        # ROI pixel (at G) -> photo pixel.
        return crop, np.array([[k / G, 0, int(ox)], [0, k / G, int(oy)], [0, 0, 1]])
    ref_crop, ref_P = roi(ref)
    out = {id(ref): np.eye(3)}
    # Walked back in time from the reference, each photo onto the one after
    # it (already laid over the reference): neighbours look alike, while the
    # first photo of a sheet - one wet stroke - has little in common with the
    # dry sheet.
    order = sorted((p for p in photos if p is not ref), key=lambda p: p['t'] or '')
    done = [ref]
    for photo in reversed(order):
        crop, P = roi(photo)
        b, k = boxes[id(photo)], photo['k']
        common = [n for n in b if n in rb]

        def miss(T):
            return np.median([math.hypot(*((T @ [rb[n][0], rb[n][1], 1])[:2] - np.array(b[n][:2]))) / k for n in common])
        # The photo after it first; if that match does not hold (the strokes
        # land off), the ones after that, then the reference itself.
        best = None
        for target in done[:-4:-1] + ([ref] if ref not in done[:-4:-1] else []):
            placed = photo_in_ref(target, out[id(target)], ref_P, size)
            M, score, ang, sc = align.align(placed, crop, src_px=G, levels=(G / 2, G))
            T = P @ np.vstack([M, [0, 0, 1]]) @ np.linalg.inv(ref_P)
            m = miss(T)
            if best is None or m < best[1]:
                best = (T, m, score, ang, sc)
            if m <= MAX_MISS_MM:
                break
        T, m, score, ang, sc = best
        note = ''
        if m > MAX_MISS_MM:
            # A photo taken close up, of one stroke on an empty sheet, gives
            # the match little to hold on to; the strokes' own centres (and
            # the coin's scale) place it.
            mp = np.mean([b[n][:2] for n in common], axis=0)
            mr = np.mean([rb[n][:2] for n in common], axis=0)
            f = k / rk
            T = np.array([[f, 0, mp[0] - mr[0] * f], [0, f, mp[1] - mr[1] * f], [0, 0, 1]])
            note = f' - strokes off by {m:.1f} mm, placed by their centres'
        out[id(photo)] = T
        done.append(photo)
        print(f"  {os.path.basename(photo['file'])}: sheet match {score:.2f}, rot {ang:+.2f}°, scale {sc:.3f}, strokes {m:.1f} mm{note}", flush=True)
    return out


def photo_in_ref(photo, T, ref_P, size):
    """`photo` resampled onto the reference's sheet ROI (at SHEET_PX)."""
    A = T @ ref_P
    return photo['im'].transform(size, Image.AFFINE, tuple(A[:2].ravel()), Image.BILINEAR, fillcolor=(255, 255, 255))


def render(photo, T, centre, wmm, hmm, k_ref):
    """The stroke's box - `wmm` x `hmm` around `centre` in the reference photo
    - out of `photo` through T (reference pixel -> photo pixel), at
    PX_PER_MM. Drawn at twice the size and brought down, so the ~1.5x
    reduction from the photo does not alias."""
    P = refs.PX_PER_MM
    w, h = round(wmm * P), round(hmm * P)
    # Output pixel (at 2P) -> reference pixel.
    s = k_ref / (2 * P)
    O = np.array([[s, 0, centre[0] - wmm * k_ref / 2], [0, s, centre[1] - hmm * k_ref / 2], [0, 0, 1]])
    A = T @ O
    big = photo['im'].transform((2 * w, 2 * h), Image.AFFINE, tuple(A[:2].ravel()), Image.BICUBIC, fillcolor=(255, 255, 255))
    return big.resize((w, h), Image.LANCZOS)


def settle(seq, T, centre, wmm, hmm, k_ref, local=True):
    """The stroke's frames, placed by the sheet's registration and then
    nudged onto each other where they are.

    One similarity per photo is a compromise over the sheet: a phone held at
    a slight tilt leaves a stroke at the edge of the sheet a millimetre off.
    Each frame (with LOCAL_PAD_MM of sheet around it) is refined onto the frame
    after it, walking back from the last, by Gauss-Newton from where the sheet
    put it - small corrections only (LOCAL_MAX_*), so paint that moved as it
    dried cannot drag the frame along. Off (`localRefine: false`) for a sheet
    where the paint is all there is and it changes shape from frame to frame
    (sheet 3, drops blooming into puddles)."""
    P = refs.PX_PER_MM
    pad = LOCAL_PAD_MM if local else 0
    padded = [render(x[0], T[id(x[0])], centre, wmm + 2 * pad, hmm + 2 * pad, k_ref) for x in seq]
    if local:
        D = 6
        placed = [None] * len(seq)
        placed[-1] = padded[-1]
        for i in range(len(seq) - 2, -1, -1):
            r, f = align.feature(placed[i + 1], D), align.feature(padded[i], D)
            h, w = r.shape
            a, s, tx, ty = align.refine(r, f, 0.0, 1.0, 0.0, 0.0)
            if abs(a) < LOCAL_MAX_DEG and abs(s - 1) < LOCAL_MAX_SCALE and math.hypot(tx, ty) < LOCAL_MAX_MM * D:
                M = align.similarity(a, s, w / 2, h / 2)
                M[:, 2] += (tx, ty)
                M[:, 2] *= P / D
                placed[i] = padded[i].transform(padded[i].size, Image.AFFINE, tuple(M.ravel()), Image.BICUBIC, fillcolor=(255, 255, 255))
            else:
                placed[i] = padded[i]
        padded = placed
    x0 = round(pad * P)
    w, h = round(wmm * P), round(hmm * P)
    return [p.crop((x0, x0, x0 + w, x0 + h)) for p in padded]


def main(spec_path):
    spec = json.load(open(spec_path, encoding='utf-8'))
    a = refs.load()
    sheet = refs.sheet_of(a, spec['sheet'])
    frames = {}  # n -> [(photo, t, px_per_mm, (cx, cy) px, (w, h) mm)]
    dry = spec.get('dry')
    boxes = {}
    for photo in spec['photos'] + ([dry] if dry else []):
        photo.setdefault('coinKind', sheet['coin'])
        im, t = refs.open_photo(photo['file'])
        if photo.get('rotate'):
            # Counter-clockwise, degrees: the sheet photographed turned.
            im = im.rotate(photo['rotate'], expand=True)
        W, H = im.size
        f = max(1, W // WORK_WIDTH)
        small = np.asarray(im.resize((W // f, H // f), Image.BILINEAR))
        m = paint_mask(small, *spec.get('paint', (18, 8)))
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        k = scale(photo, im)
        photo['im'], photo['k'], photo['t'] = im, k, t
        print(os.path.basename(photo['file']), f'{k:.2f} px/mm', f"coin {photo['coinPx']:.0f} px" if 'coinPx' in photo else '')
        d = W / photo.get('displayWidth', 2000)
        for n, (sx, sy) in photo['seeds'].items():
            x0, y0, x1, y1 = region(m, (sx * d / f, sy * d / f))
            x0, y0, x1, y1 = x0 * f, y0 * f, x1 * f, y1 * f
            frames.setdefault(int(n), []).append(
                (photo, im, t, k, ((x0 + x1) / 2, (y0 + y1) / 2), ((x1 - x0) / k, (y1 - y0) / k)))
            boxes.setdefault(id(photo), {})[int(n)] = ((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / k, (y1 - y0) / k)
    photos = spec['photos'] + ([dry] if dry else [])
    # The reference: the dry shot - every stroke finished - else the latest.
    ref = dry or max(spec['photos'], key=lambda p: p['t'] or '')
    T = sheet_transforms(photos, boxes, ref)
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
        wet = sorted((x for x in fr if x[0] is not dry), key=lambda x: x[2] or '')
        seq = wet + [x for x in fr if x[0] is dry]
        centre = boxes[id(ref)][n][:2] if n in boxes[id(ref)] else seq[-1][4]
        crops = settle(seq, T, centre, wmm, hmm, ref['k'], spec.get('localRefine', True))
        first = None
        for i, ((photo, im, t, k, _c, _s), crop) in enumerate(zip(seq, crops), 1):
            if photo is dry:
                out = os.path.join(refs.ROOT, 'img', sheet['id'], f'{n:03d}-dry.jpg')
                w, h = refs.save_crop(crop, out)
                st['dry'] = {'src': refs.rel(out), 't': t, 'w': w, 'h': h, 'photo': os.path.basename(photo['file'])}
                continue
            out = os.path.join(refs.ROOT, 'img', sheet['id'], f'{n:03d}-wet-{i:02d}.jpg')
            w, h = refs.save_crop(crop, out)
            first = first or t
            age = (np.datetime64(t) - np.datetime64(first)).astype('timedelta64[s]').astype(int).item() if t and first else None
            st['wet'].append({'src': refs.rel(out), 't': t, 'ageS': age, 'w': w, 'h': h, 'photo': os.path.basename(photo['file'])})
        print(n, f'{len(wet)} frames', '+ dry' if len(wet) < len(fr) else '', f'{wmm:.0f}x{hmm:.0f} mm', flush=True)
    # Re-read before writing: sheets are rebuilt in parallel, each owns only
    # its own entry.
    a = refs.load()
    a['sheets'] = [sheet if s['id'] == sheet['id'] else s for s in a['sheets']]
    refs.save(a)


if __name__ == '__main__':
    main(sys.argv[1])
