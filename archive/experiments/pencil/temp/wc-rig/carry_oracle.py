"""CPU oracle of the carry (WC_FIELD_OP_FRAG mode 15, ADR 011 s17.29) over a dumped cost field.
Usage: python3 carry_oracle.py <field dir> <out.png> [budget costMax rate pow]
Initial paint: 1 inside the footprint (deep zone, cost 0, plus the film plateau), 0 elsewhere."""
import sys, numpy as np
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
budget = float(sys.argv[3]) if len(sys.argv) > 3 else 18
costMax = float(sys.argv[4]) if len(sys.argv) > 4 else 22
rate = float(sys.argv[5]) if len(sys.argv) > 5 else 0.7
pw = float(sys.argv[6]) if len(sys.argv) > 6 else 3
CAP = int(sys.argv[7]) if len(sys.argv) > 7 else 12
TOPDIV = float(sys.argv[8]) if len(sys.argv) > 8 else 4
p = np.asarray(Image.open(f'{d}/field_pressure_r.pgm')).astype(float) / 255.0
cost = p * costMax
dom = cost <= budget - 1.5
foot = (cost < 0.1) | ((cost >= budget - 2.5) & (cost < budget - 0.5))
paint = foot.astype(float)

def strides(b):
    top = max(1, int(b // TOPDIV)); up = []
    s = 1
    while s <= top: up.append(s); s *= 2
    cyc = up + up[::-1]; o = []; sm = 0
    while sm * rate < b and len(o) < CAP: o.append(cyc[len(o) % len(cyc)]); sm += o[-1]
    return o

def shifted(a, dx, dy):
    """a sampled at (x+dx, y+dy); off-field = nan"""
    r = np.full_like(a, np.nan); H, W = a.shape
    xs = slice(max(0, dx), min(W, W + dx)); xd = slice(max(0, -dx), min(W, W - dx))
    ys = slice(max(0, dy), min(H, H + dy)); yd = slice(max(0, -dy), min(H, H - dy))
    r[yd, xd] = a[ys, xs]
    return r

def weights(s):
    """w[k] = weight of texel toward neighbour k at stride s (0:+x 1:-x 2:+y 3:-y)"""
    ws = []
    for (dx, dy) in [(s, 0), (-s, 0), (0, s), (0, -s)]:
        cj = shifted(cost, dx, dy)
        inn = np.isfinite(cj) & (cj <= budget - 1.5)
        dd = cj - cost
        w = np.where(inn & (dd > 1e-3), np.minimum(s / np.where(dd > 1e-3, dd, 1), 4.0) ** pw, 0.0)
        ws.append(w)
    return ws

for s in strides(budget):
    ws = weights(s); wsum = sum(ws)
    new = paint.copy()
    for k, (dx, dy) in enumerate([(s, 0), (-s, 0), (0, s), (0, -s)]):
        pj = shifted(paint, dx, dy)
        okj = np.isfinite(pj)
        # give my excess over j, by my share toward j
        give = np.where(okj & (ws[k] > 0) & dom, rate * ws[k] / np.where(wsum > 0, wsum, 1) * np.maximum(paint - np.where(okj, pj, 0), 0), 0.0)
        new -= give
        # take j's excess over me, by j's share toward me
        back = k ^ 1
        wj = shifted(wsum, dx, dy); wme = shifted(ws[back], dx, dy)
        ok = np.isfinite(wj) & (wme > 0)
        new += np.where(ok, rate * wme / np.where(ok, wj, 1) * np.maximum(np.where(okj, pj, 0) - paint, 0), 0.0)
    paint = new
print('mass', foot.sum(), '->', paint.sum().round(1), 'max', paint.max().round(2))
bins = [0, 0.1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 30]
idx = np.digitize(cost, bins) - 1
print('paint by cost (cells):', [(bins[i], round(float(paint[idx == i].mean()), 2)) for i in range(len(bins) - 1) if (idx == i).any()])
ys, xs = np.nonzero(p < 1); y0, y1, x0, x1 = ys.min() - 5, ys.max() + 5, xs.min() - 5, xs.max() + 5
g = np.clip(paint[y0:y1, x0:x1] / 2.0, 0, 1)
im = Image.fromarray((255 - g * 255).astype(np.uint8)).resize(((x1 - x0) * 3, (y1 - y0) * 3), Image.NEAREST)
im.save(out); print(out)
