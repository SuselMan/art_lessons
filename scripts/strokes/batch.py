#!/usr/bin/env python3
"""A whole sheet's photos, pulled from the phone, into the archive (#536).

  batch.py <spec.json>

For the phone flow: Ilya shoots a sheet as it dries, a dozen photos or more,
from wherever he stands, turned any way, the coin in some of them only. The
strokes are marked once, on one reference photo (`ref`: a photo with the coin
in it, turned upright by `rotate`, and `boxes` - each stroke's box in a
preview `displayWidth` wide). Every other photo is found against it:

1. Coarse: the reference's sheet (its strokes' boxes plus a margin) is
   searched for in the whole photo over the four right-angle turns, a few
   degrees either way and a wide range of scale - a template match by FFT,
   normalised so the brightest thing in the photo does not win.
2. Fine: the photo, laid over the reference by that, is registered onto it
   (align.py) - rotation, scale, shift - for the last few tenths of a mm.

Photos are walked back in time from the reference's end: each is matched
against the one after it, already placed - neighbours look alike, while the
first photo of a sheet (one wet stroke) has little in common with the dry
sheet. Each stroke's frames are then cut through these maps at one box (the
reference's, plus a margin), nudged onto each other (sheet.settle), and the
last photo of the list is the dry shot.

A stroke is in a photo from the first photo in which it - or any stroke
painted after it - shows paint in its box: strokes are painted in order, and
a stroke of almost clear water never shows paint at all.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import align  # noqa: E402
import refs  # noqa: E402
import sheet as sh  # noqa: E402

MARGIN_MM = 4
ROI_PAD_MM = 15
COARSE_PX = 1.0  # px/mm of the coarse search
FINE_PX = 3  # px/mm of the fine registration
PRESENT = 0.04  # share of paint pixels in a stroke's box that says it is there
MIN_FIT = 0.5  # a photo registered worse than this is left out
GOOD_FIT = 0.85  # ...and one registered better is matched against by the next


def upright(path, rotate=0):
    im, t = refs.open_photo(path)
    return (im.rotate(rotate, expand=True) if rotate else im), t


def feat(im, f):
    """Paint density of `im` resampled by factor `f`, zero-mean."""
    w, h = im.size
    small = im.resize((max(8, round(w * f)), max(8, round(h * f))), Image.BILINEAR)
    a = np.asarray(small).astype(np.float32)
    if align.MODE == 'chroma':
        return np.clip(a.max(axis=2) - a.min(axis=2) - 25, 0, None)
    return np.clip((a[..., 0] + a[..., 2]) / 2 - a[..., 1], 0, None)


def ncc_map(F, t, mask):
    """Normalised cross-correlation of template `t` (with its support `mask`)
    over image F, by FFT; the map of scores by the template's top-left
    corner. Normalised by F's own variance under the template, so a bright
    patch (the paint box, a purple jar) does not win by brightness."""
    H, W = F.shape[0] + t.shape[0], F.shape[1] + t.shape[1]
    n = mask.sum()
    t = (t - t[mask].mean()) * mask
    m = mask.astype(np.float32)
    fT = np.conj(np.fft.rfft2(t, (H, W)))
    fM = np.conj(np.fft.rfft2(m, (H, W)))
    fF = np.fft.rfft2(F, (H, W))
    num = np.fft.irfft2(fF * fT, (H, W))
    s1 = np.fft.irfft2(fF * fM, (H, W))
    s2 = np.fft.irfft2(np.fft.rfft2(F * F, (H, W)) * fM, (H, W))
    var = np.clip(s2 - s1 * s1 / n, 1e-3, None)
    score = num / (np.sqrt(var) * np.linalg.norm(t) + 1e-6)
    return score[:F.shape[0] - t.shape[0] + 1, :F.shape[1] - t.shape[1] + 1]


def coarse(tpl, photo, guess):
    """Where `tpl` (an image of the reference sheet) is in `photo`: the 3x3
    map tpl pixel -> photo pixel, with its score, scale and turn. `guess`:
    photo pixels per tpl pixel, roughly - searched from 0.6 to 1.6 of it."""
    best = None
    tf = feat(tpl, 1.0)
    th, tw = tf.shape
    # The sheet lies along the photo's long side or across it - which, the
    # photo's shape says: two quarter turns to try, not four. A photo with
    # little on it (the first, one stroke of clear water) matched a sheet
    # turned and shrunk otherwise.
    same = (photo.width >= photo.height) == (tw >= th)
    # ...unless the sheet's part is near square (sheet 7): then its shape says
    # nothing, all four.
    squarish = 0.8 < tw / th < 1.25
    quarters = (0, 1, 2, 3) if squarish else (0, 2) if same else (1, 3)
    for sc in np.exp(np.linspace(math.log(0.75), math.log(1.35), 11)):
        f = 1 / (guess * sc)  # the photo brought to the template's scale
        F = feat(photo, f)
        for quarter in quarters:
            for ang in np.arange(-6, 6.1, 2):
                a = quarter * 90 + ang
                c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
                ow = int(abs(tw * c) + abs(th * s)) + 2
                oh = int(abs(tw * s) + abs(th * c)) + 2
                if oh >= F.shape[0] or ow >= F.shape[1]:
                    continue
                # Output (the template turned) -> template pixel, about both centres.
                M = np.array([[c, s, tw / 2 - c * ow / 2 - s * oh / 2], [-s, c, th / 2 + s * ow / 2 - c * oh / 2]])
                T = align.warp(tf, M, (ow, oh))
                sup = align.warp(np.ones_like(tf), M, (ow, oh)) > 0.99
                S = ncc_map(F, T, sup)
                i = int(np.argmax(S))
                y, x = divmod(i, S.shape[1])
                if best is None or S[y, x] > best[0]:
                    best = (float(S[y, x]), sc, a, x, y, f, M)
    score, sc, a, x, y, f, M = best
    # tpl pixel -> turned output -> F pixel (+x, +y) -> photo pixel (/f)
    Minv = np.linalg.inv(np.vstack([M, [0, 0, 1]]))
    return np.diag([1 / f, 1 / f, 1]) @ np.array([[1, 0, x], [0, 1, y], [0, 0, 1]]) @ Minv, score, sc, a


def main(spec_path):
    spec = json.load(open(spec_path, encoding='utf-8'))
    align.MODE = spec.get('feature', 'violet')
    a = refs.load()
    sid = spec['sheet']
    if not any(s['id'] == sid for s in a['sheets']):
        a['sheets'].append({'id': sid, 'coin': spec.get('coin', '50eurocent'), 'paper': '', 'note': spec.get('note', ''), 'strokes': []})
        refs.save(a)
    sheet = refs.sheet_of(a, sid)
    if spec.get('note'):
        sheet['note'] = spec['note']

    # The reference: upright, its scale from the coin.
    r = spec['ref']
    rim, rt = upright(r['file'], r.get('rotate', 0))
    rphoto = {'file': r['file'], 'coinAt': r['coinAt'], 'coinKind': sheet['coin']}
    rk = sh.scale(rphoto, rim)
    d = rim.width / r.get('displayWidth', 2000)
    boxes = {int(n): [v * d for v in b] for n, b in r['boxes'].items()}
    x0 = min(b[0] for b in boxes.values()) - ROI_PAD_MM * rk
    y0 = min(b[1] for b in boxes.values()) - ROI_PAD_MM * rk
    x1 = max(b[2] for b in boxes.values()) + ROI_PAD_MM * rk
    y1 = max(b[3] for b in boxes.values()) + ROI_PAD_MM * rk
    # ROI at FINE_PX: ROI pixel -> reference pixel.
    G = FINE_PX
    size = (round((x1 - x0) / rk * G), round((y1 - y0) / rk * G))
    refP = np.array([[rk / G, 0, x0], [0, rk / G, y0], [0, 0, 1]])
    ref_roi = rim.transform(size, Image.AFFINE, tuple(refP[:2].ravel()), Image.BILINEAR)
    print(f'reference {os.path.basename(r["file"])}: {rk:.2f} px/mm, sheet {size[0] / G:.0f}x{size[1] / G:.0f} mm', flush=True)

    photos = []
    for f in spec['photos']:
        im, t = upright(f)
        photos.append({'file': f, 'im': im, 't': t})
    photos.sort(key=lambda p: p['t'] or '')
    rp = next((p for p in photos if os.path.samefile(p['file'], r['file'])), None)
    if rp is None:
        sys.exit('the reference must be one of the photos')
    # The reference photo's own map: its upright turn undone.
    W0, H0 = rp['im'].size
    rot = r.get('rotate', 0) % 360
    # upright pixel -> original pixel for a counter-clockwise turn by `rot`
    U = {0: np.eye(3),
         90: np.array([[0, -1, W0 - 1], [1, 0, 0], [0, 0, 1]]),
         270: np.array([[0, 1, 0], [-1, 0, H0 - 1], [0, 0, 1]]),
         180: np.array([[-1, 0, W0 - 1], [0, -1, H0 - 1], [0, 0, 1]])}[rot]
    T = {id(rp): U}
    # Walk out from the reference both ways, each photo onto its placed
    # neighbour.
    i0 = photos.index(rp)
    photos_dropped = []
    def match(p, target):
        A = T[id(target)] @ refP
        placed = target['im'].transform(size, Image.AFFINE, tuple(A[:2].ravel()), Image.BILINEAR, fillcolor=(255, 255, 255))
        # Photo pixels per ROI pixel, roughly: as for the target, if both
        # photos take in the same field.
        guess = max(p['im'].size) / max(target['im'].size) * math.hypot(*A[:2, 0])
        T0, cs, csc, cang = coarse_roi(placed, p['im'], guess)
        # Fine: the photo laid over the ROI by T0, registered onto it.
        over = p['im'].transform(size, Image.AFFINE, tuple(T0[:2].ravel()), Image.BILINEAR, fillcolor=(255, 255, 255))
        M, score, ang, sc = align.align(placed, over, src_px=G, levels=(G / 2, G))
        return T0 @ np.vstack([M, [0, 0, 1]]) @ np.linalg.inv(refP), score, cs, csc, cang

    for order in (range(i0 - 1, -1, -1), range(i0 + 1, len(photos))):
        good = [rp]  # placed photos solid enough to match against, newest first last
        for i in order:
            p = photos[i]
            # The neighbour first; if it does not hold (a photo taken from an
            # odd angle, sheet 7's 16:10, breaks the chain), the ones placed
            # before it, then the reference itself.
            best = None
            targets = good[::-1][:3]
            if rp not in targets:
                targets.append(rp)
            for target in targets:
                r = match(p, target)
                if best is None or r[1] > best[1]:
                    best = r
                if r[1] >= GOOD_FIT:
                    break
            Tp, score, cs, csc, cang = best
            if score < MIN_FIT:
                # Nothing to hold on to: dropped rather than shown off place.
                print(f"  {os.path.basename(p['file'])}: fit {score:.2f} - dropped", flush=True)
                photos_dropped.append(p)
                continue
            T[id(p)] = Tp
            print(f"  {os.path.basename(p['file'])}: found {cs:.2f} (turn {cang:+.0f}°, scale x{csc:.2f}), fit {score:.2f}", flush=True)
            if score >= GOOD_FIT:
                good.append(p)  # a weak fit is kept, but not built upon

    photos = [p for p in photos if p not in photos_dropped]
    # Presence, per stroke per photo.
    P = refs.PX_PER_MM
    mw, mh = spec.get('minBoxMm', (0, 0))
    geo = {}
    for n, (bx0, by0, bx1, by1) in boxes.items():
        wmm = max((bx1 - bx0) / rk + 2 * MARGIN_MM, mw)
        hmm = max((by1 - by0) / rk + 2 * MARGIN_MM, mh)
        geo[n] = (((bx0 + bx1) / 2, (by0 + by1) / 2), wmm, hmm)
    thr = spec.get('paint', (18, 8))
    shows = {}
    for p in photos:
        for n, (c, wmm, hmm) in geo.items():
            crop = sh.render(p, T[id(p)], c, wmm, hmm, rk)
            small = np.asarray(crop.resize((crop.width // 4, crop.height // 4))).astype(int)
            m = (small.max(axis=2) - small.min(axis=2) > 45) if align.MODE == 'chroma' else sh.paint_mask(small, *thr)
            shows[(id(p), n)] = float(m.mean()) > PRESENT
    last = photos[-1]
    for st in sheet['strokes']:
        for w in st['wet']:
            q = os.path.join(refs.ROOT, w['src'])
            if os.path.exists(q):
                os.remove(q)
        st['wet'] = []
    for n in sorted(geo):
        c, wmm, hmm = geo[n]
        first = next((i for i, p in enumerate(photos) if any(shows[(id(p), m)] for m in geo if m >= n)), len(photos) - 1)
        seq = [(p, p['im'], p['t'], None, None, None) for p in photos[first:]]
        crops = sh.settle(seq, T, c, wmm, hmm, rk, spec.get('localRefine', True))
        st = refs.stroke_of(sheet, n)
        t0 = None
        wet_i = 0
        for (p, *_), crop in zip(seq, crops):
            if p is last:
                out = os.path.join(refs.ROOT, 'img', sid, f'{n:03d}-dry.jpg')
                w, h = refs.save_crop(crop, out)
                st['dry'] = {'src': refs.rel(out), 't': p['t'], 'w': w, 'h': h, 'photo': os.path.basename(p['file'])}
                continue
            wet_i += 1
            out = os.path.join(refs.ROOT, 'img', sid, f'{n:03d}-wet-{wet_i:02d}.jpg')
            w, h = refs.save_crop(crop, out)
            t0 = t0 or p['t']
            age = (np.datetime64(p['t']) - np.datetime64(t0)).astype('timedelta64[s]').astype(int).item() if p['t'] and t0 else None
            st['wet'].append({'src': refs.rel(out), 't': p['t'], 'ageS': age, 'w': w, 'h': h, 'photo': os.path.basename(p['file'])})
        if spec.get('labels', {}).get(str(n)):
            st['label'] = spec['labels'][str(n)]
        print(n, f'{wet_i} frames + dry', f'{wmm:.0f}x{hmm:.0f} mm', flush=True)
    if spec.get('dryMatch'):
        print('dry matched to the last wet frame, exponents', match_dry(sheet), flush=True)
    a = refs.load()
    a['sheets'] = [sheet if s['id'] == sid else s for s in a['sheets']]
    if not any(s['id'] == sid for s in a['sheets']):
        a['sheets'].append(sheet)
    refs.save(a)


# What drying itself does to a stroke's colour, as the archive's other sheets
# measured it (sheets 1-8): the dry shot's paper-normalised transmittance per
# channel raised to about this gives the last wet frame's - a stroke dries a
# little lighter, not greyer.
DRY_EXPONENT = (0.92, 0.9, 0.97)


def match_dry(sheet):
    """(spec `dryMatch`) The dry shot taken in other light: sheets 9-10's came
    out washed - the red of a blue stroke at 3-4x its wet transmittance, as if
    laid over white at half opacity (Ilya: "блеклый, как будто с прозрачностью").
    Fit, over every stroke of the sheet, the per-channel exponent that maps the
    dry crop's transmittance (pixel / paper, paper is 250 after whitening) onto
    the last wet frame's, take out what drying itself does (DRY_EXPONENT) and
    rewrite the dry crops with the rest. One mapping for the whole photo: it is
    the photo's light that is off, the same for every stroke on it."""
    num, den = np.zeros(3), np.zeros(3)
    pairs = []
    for st in sheet['strokes']:
        if not st.get('dry') or not st['wet']:
            continue
        w = np.asarray(Image.open(os.path.join(refs.ROOT, st['wet'][-1]['src'])).convert('RGB')).astype(float)
        d = np.asarray(Image.open(os.path.join(refs.ROOT, st['dry']['src'])).convert('RGB')).astype(float)
        pairs.append(st)
        if w.shape != d.shape:
            continue
        for c in range(3):
            tw = np.clip(w[..., c] / 250, 1e-3, 1)
            td = np.clip(d[..., c] / 250, 1e-3, 1)
            m = (tw < 0.85) & (td < 0.92)
            if m.sum() < 50:
                continue
            q = np.linspace(0.05, 0.6, 12)
            lw, ld = np.log(np.quantile(tw[m], q)), np.log(np.quantile(td[m], q))
            num[c] += (lw * ld).sum()
            den[c] += (ld * ld).sum()
    k = np.where(den > 0, num / np.maximum(den, 1e-9), 1.0) / np.array(DRY_EXPONENT)
    k = np.maximum(k, 1.0)  # only ever deepen: a dry shot is never corrected paler
    for st in pairs:
        path = os.path.join(refs.ROOT, st['dry']['src'])
        d = np.asarray(Image.open(path).convert('RGB')).astype(float)
        t = np.clip(d / 250, 1e-4, 1) ** k
        Image.fromarray(np.clip(t * 250 + np.maximum(d - 250, 0), 0, 255).astype(np.uint8)).save(path, quality=refs.JPEG_QUALITY)
    return [round(float(v), 2) for v in k]


def coarse_roi(roi, photo, guess):
    """The ROI image (at FINE_PX) found in `photo`: 3x3 map ROI pixel ->
    photo pixel. `guess`: photo pixels per ROI pixel, roughly."""
    # Search at COARSE_PX: the template at COARSE_PX / FINE_PX of the ROI.
    k = COARSE_PX / FINE_PX
    tpl = roi.resize((max(8, round(roi.width * k)), max(8, round(roi.height * k))), Image.BILINEAR)
    Tm, score, sc, ang = coarse(tpl, photo, guess / k)
    # tpl pixel -> photo pixel; ROI pixel = tpl pixel / k
    return Tm @ np.diag([k, k, 1]), score, sc, ang


if __name__ == '__main__':
    main(sys.argv[1])
