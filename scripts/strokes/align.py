"""Registration of one stroke's frames onto each other (#536).

Every frame of a stroke is cut from a different photo: the phone moved, the
sheet was turned, the coin gives the scale only to a percent or so. Centring
each frame on the paint's bounding box leaves the stroke swimming when the
viewer plays the series - the box follows the paint as it spreads.

`align(ref, img)` finds the similarity transform (rotation, scale, shift) that
lays `img` over `ref`, on a feature both photos share whatever the light: how
much the paint takes out of green against red and blue. It searches the
rotation and scale on a grid and takes the shift from an FFT cross-correlation
at each grid point, coarse then fine - a global search, so a frame far off
cannot fall into a local optimum the way a gradient method would.

numpy and PIL only: the machine has no OpenCV/scipy and the archive should not
need a system package to rebuild.
"""
import math

import numpy as np
from PIL import Image, ImageFilter

PX_PER_MM = 12


def feature(im, px_per_mm, src_px=PX_PER_MM):
    """Paint density at `px_per_mm`, blurred, zero-mean. Violet paint absorbs
    green; paper, gloss and pencil do not stand out on it."""
    w, h = im.size
    f = px_per_mm / src_px
    small = im.resize((max(8, round(w * f)), max(8, round(h * f))), Image.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(1.0))  # PIL blurs RGB, not float
    a = np.asarray(small).astype(np.float32)
    d = np.clip((a[..., 0] + a[..., 2]) / 2 - a[..., 1], 0, None)
    return d - d.mean()


def similarity(a_deg, s, cx, cy):
    """The 2x3 map output -> input: rotate by `a_deg` and scale by `s` about
    the centre (cx, cy)."""
    a = math.radians(a_deg)
    c, n = s * math.cos(a), s * math.sin(a)
    return np.array([[c, -n, cx - c * cx + n * cy], [n, c, cy - n * cx - c * cy]])


def warp(arr, M, size=None):
    """Resample `arr` (a float image) at M @ (u, v, 1) for every output pixel."""
    h, w = arr.shape if size is None else size[::-1]
    data = (M[0, 0], M[0, 1], M[0, 2], M[1, 0], M[1, 1], M[1, 2])
    im = Image.fromarray(arr.astype(np.float32), mode='F')
    return np.asarray(im.transform((w, h), Image.AFFINE, data, Image.BILINEAR, fillcolor=0))


def shift_of(ref, img):
    """The shift t, best NCC score: ref(u) ~ img(u + t)."""
    h, w = ref.shape
    H, W = 2 * h, 2 * w
    R = np.fft.rfft2(ref, (H, W))
    F = np.fft.rfft2(img, (H, W))
    corr = np.fft.irfft2(F * np.conj(R), (H, W))
    i = int(np.argmax(corr))
    y, x = divmod(i, W)
    peak = corr[y, x]

    def sub(c_m, c0, c_p):
        # A parabola through the peak and its neighbours: the sub-pixel shift.
        den = c_m - 2 * c0 + c_p
        return 0.0 if den == 0 else 0.5 * (c_m - c_p) / den
    dx = x + sub(corr[y, x - 1], peak, corr[y, (x + 1) % W])
    dy = y + sub(corr[y - 1, x], peak, corr[(y + 1) % H, x])
    dx = dx - W if dx > W / 2 else dx
    dy = dy - H if dy > H / 2 else dy
    norm = float(np.linalg.norm(ref) * np.linalg.norm(img)) or 1.0
    return (dx, dy), peak / norm


def search(ref, img, angles, scales):
    h, w = ref.shape
    best = None
    for a in angles:
        for s in scales:
            M = similarity(a, s, w / 2, h / 2)
            (dx, dy), score = shift_of(ref, warp(img, M, (w, h)))
            if best is None or score > best[0]:
                best = (score, a, s, dx, dy)
    return best


def refine(ref, img, a, s, tx, ty, iters=12):
    """Gauss-Newton on (angle, scale, shift) from the grid's answer, over the
    overlap only. The grid's score is a cross-correlation over the padded
    frame, and it leans to the scale that keeps more paint inside; the
    residual over the overlap does not. A gain and an offset go into the same
    least squares: the paint pales as it dries, a shift cannot fix that."""
    h, w = ref.shape
    ones = np.ones_like(img)

    def render(p):
        M = similarity(p[0], p[1], w / 2, h / 2)
        M[:, 2] += (p[2], p[3])
        return warp(img, M, (w, h)), warp(ones, M, (w, h)) > 0.999
    p = np.array([a, s, tx, ty], dtype=np.float64)
    eps = np.array([0.02, 0.0005, 0.2, 0.2])
    for _ in range(iters):
        cur, valid = render(p)
        cols = []
        for i in range(4):
            q = p.copy(); q[i] += eps[i]
            nxt, v2 = render(q)
            valid &= v2
            cols.append((nxt - cur) / eps[i])
        m = valid.ravel()
        J = np.stack([c.ravel()[m] for c in cols] + [cur.ravel()[m], np.ones(int(m.sum()))], axis=1)
        # ref ~ g * warped(p + dp) + b, linearised: ref - cur ~ J dp' with the
        # gain folded in as g = 1 + dg.
        rhs = ref.ravel()[m] - cur.ravel()[m]
        sol = np.linalg.lstsq(J, rhs, rcond=None)[0]
        dp = sol[:4]
        p += dp
        if np.all(np.abs(dp) < eps * 0.05):
            break
    return p


def align(ref_im, img_im, src_px=PX_PER_MM, levels=(3, 6)):
    """The 2x3 map (at PX_PER_MM, both images the same size) from `ref_im`'s
    pixels to `img_im`'s: resampling img_im with it lays it over ref_im.
    Returns (M, score)."""
    w, h = ref_im.size
    # Coarse: 3 px/mm, the whole plausible range.
    D, D2 = levels
    r, f = feature(ref_im, D, src_px), feature(img_im, D, src_px)
    score, a, s, dx, dy = search(r, f, np.arange(-4, 4.01, 0.5), np.arange(0.95, 1.051, 0.01))
    # Fine: 6 px/mm around it.
    r, f = feature(ref_im, D2, src_px), feature(img_im, D2, src_px)
    score, a, s, dx, dy = search(r, f, a + np.arange(-0.5, 0.51, 0.125), s + np.arange(-0.01, 0.0101, 0.0025))
    score, a, s, dx, dy = search(r, f, a + np.arange(-0.1, 0.11, 0.05), s + np.arange(-0.002, 0.0021, 0.001))
    # The map at 6 px/mm: u -> A(u + t), A the similarity about the centre.
    hh, ww = r.shape
    A = similarity(a, s, ww / 2, hh / 2)
    t = A[:, :2] @ np.array([dx, dy])
    ra, rs, rx, ry = refine(r, f, a, s, float(t[0]), float(t[1]))
    # Gauss-Newton is local: from a poor grid answer (little in common
    # between the two images) it can run off. Kept only near the grid's.
    if abs(ra - a) < 0.6 and abs(rs - s) < 0.012 and math.hypot(rx - t[0], ry - t[1]) < 3 * D2:
        a, s, tx, ty = ra, rs, rx, ry
    else:
        tx, ty = float(t[0]), float(t[1])
    M = similarity(a, s, ww / 2, hh / 2)
    M[:, 2] += (tx, ty)
    score = float(np.corrcoef(r.ravel(), warp(f, M, (ww, hh)).ravel())[0, 1])
    # Up to the images' own scale: the linear part stays, the offsets scale.
    M[:, 2] *= src_px / D2
    return M, score, a, s
