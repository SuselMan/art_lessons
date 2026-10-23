"""R_front(theta) of a bloom and its harmonic content: how much of the front's
raggedness lives in 2-8 lobes (what survives a blur) against 9-36.
usage: frontspec.py img cx cy R"""
import sys, numpy as np
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); cx, cy, R = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
a = np.asarray(im).astype(float) / 255
D = 1 - (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])
H, W = D.shape; Y, X = np.mgrid[0:H, 0:W]; r = np.hypot(X - cx, Y - cy)
bg = D[(r > 1.8 * R) & (r < 2.4 * R)].mean()
prof = np.array([D[(r >= k) & (r < k + 1)].mean() for k in range(int(2.4 * R))])
lo, hi = int(0.6 * R), int(1.8 * R); rim = prof[lo:hi].max()
n = 144; fronts = []
for i in range(n):
    t = 2 * np.pi * i / n; best = 0
    for k in range(int(0.5 * R), int(2.2 * R)):
        x, y = int(round(cx + k * np.cos(t))), int(round(cy + k * np.sin(t)))
        if 0 <= x < W and 0 <= y < H and D[y, x] > bg + 0.5 * (rim - bg): best = k
    fronts.append(best)
f = np.array(fronts, float); f -= f.mean()
P = np.abs(np.fft.rfft(f)) ** 2
tot = P[1:37].sum()
print(f'{sys.argv[1]}: mean R_front {np.mean(fronts):.1f}  std {f.std():.1f}  power share: k1 {P[1]/tot:.2f}  k2-4 {P[2:5].sum()/tot:.2f}  k5-8 {P[5:9].sum()/tot:.2f}  k9-16 {P[9:17].sum()/tot:.2f}  k17-36 {P[17:37].sum()/tot:.2f}')
# FWHM of the dark peak in the radial profile (the fifth number)
half = bg + 0.5 * (rim - bg); k_rim = lo + int(np.argmax(prof[lo:hi]))
l = k_rim
while l > 0 and prof[l] > half: l -= 1
h = k_rim
while h < len(prof) - 1 and prof[h] > half: h += 1
print(f'   rim at {k_rim/R:.2f}R, FWHM {h-l} px = {(h-l)/np.mean(fronts):.2f} R_front, rim/bg {rim/bg:.2f}')
