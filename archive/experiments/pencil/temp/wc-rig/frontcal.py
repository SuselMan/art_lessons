"""Oracle wettingCost on the REAL medium paper: which climb gives the photo's
R_front/R_drop 1.3 and 10-12 lobes for a radius-30 drop with budget 10?"""
import numpy as np, gzip, sys
b = gzip.decompress(open('/home/suselman/projects/pencil-agents/watercolor-feel/apps/web/public/paper/medium.1690c0e9.paper', 'rb').read())
paper = np.frombuffer(b, dtype=np.uint8).reshape(2048, 2048).astype(float) / 255
S = 160
def cost_field(h, seed, steps, climb, floor):
    c = np.full(h.shape, np.inf); c[seed] = 0
    offs = [(1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)]
    for _ in range(steps):
        best = c.copy()
        for ox, oy in offs:
            cj = np.roll(np.roll(c, -oy, 0), -ox, 1)   # neighbour j at (x+ox, y+oy)
            hj = np.roll(np.roll(h, -oy, 0), -ox, 1)
            ln = 1.41421356 if ox and oy else 1.0
            edge = ln * np.maximum(floor, 1 + climb * (h - hj))   # climbing from j to i: h_i - h_j
            best = np.minimum(best, cj + edge)
        c = best
    return c
def stats(dom, cx, cy, n=72):
    rs = []
    for k in range(n):
        a = 2*np.pi*k/n; r = 0
        while True:
            x = int(round(cx + r*np.cos(a))); y = int(round(cy + r*np.sin(a)))
            if x < 0 or y < 0 or x >= S or y >= S or not dom[y, x]: break
            r += 1
        rs.append(r)
    rs = np.array(rs, float)
    m = rs.mean(); d = rs - m
    fingers = sum(1 for k in range(n) if d[k] > 0 and d[k-1] <= 0)
    return m, rs.std()/m, fingers
Y, X = np.mgrid[0:S, 0:S]
R = 30; seed = (X-80)**2 + (Y-80)**2 <= R*R
for crop in [(300, 300), (900, 1200), (1500, 600)]:
    h = paper[crop[1]:crop[1]+S, crop[0]:crop[0]+S]
    for climb in [10, 15, 20, 25, 30, 40, 60]:
        c = cost_field(h, seed, 14, climb, 0.22)
        dom = c <= 10
        m, sp, f = stats(dom, 80, 80)
        print(f'crop {crop} climb {climb:>3}: R_front/R {m/R:.2f} spread {sp:.3f} fingers {f}')
    print()
