"""The milestone metrics of a bloom (agreed in the thread): from a picture,
the drop centre and the drop's own radius, measure the darkness D = 1 - L
(L luminance 0..1) radially: D_center/D_bg, D_rim/D_bg, R_front/R_drop and
the angular spread of R_front. Background = annulus 1.8..2.4 R_drop.
usage: python3 dropmetrics.py img cx cy R_drop [crop-scale]"""
import sys, numpy as np
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); cx, cy, R = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
a = np.asarray(im).astype(float) / 255
L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
D = 1 - L
H, W = D.shape
Y, X = np.mgrid[0:H, 0:W]
r = np.hypot(X - cx, Y - cy); ang = np.arctan2(Y - cy, X - cx)
bg = D[(r > 1.8 * R) & (r < 2.4 * R)].mean()
# radial profile, 1 px bins
prof = [D[(r >= k) & (r < k + 1)].mean() for k in range(int(2.4 * R))]
prof = np.array(prof)
center = D[r < 0.3 * R].mean()
# the rim: the max of the profile between 0.6 R and 1.8 R
lo, hi = int(0.6 * R), int(1.8 * R)
k_rim = lo + int(np.argmax(prof[lo:hi])); rim = prof[k_rim]
# the front per angle: along each ray, the radius where D first crosses (bg + rim)/2 going outward after the rim... simpler: the outermost radius where D > bg + 0.5*(rim-bg)
n = 72; fronts = []
for i in range(n):
    t = 2 * np.pi * i / n; best = 0
    for k in range(int(0.5 * R), int(2.2 * R)):
        x, y = int(round(cx + k * np.cos(t))), int(round(cy + k * np.sin(t)))
        if 0 <= x < W and 0 <= y < H and D[y, x] > bg + 0.5 * (rim - bg): best = k
    fronts.append(best)
fronts = np.array(fronts, float)
print(f'bg D {bg:.3f}  center/bg {center/bg:.2f}  rim/bg {rim/bg:.2f} at r={k_rim/R:.2f}R  R_front/R_drop {fronts.mean()/R:.2f}  spread {fronts.std()/max(fronts.mean(),1):.3f}')
print('profile (r/R: D/bg):', ' '.join(f'{k/R:.1f}:{prof[k]/bg:.2f}' for k in range(0, len(prof), max(1, int(R/8)))))
