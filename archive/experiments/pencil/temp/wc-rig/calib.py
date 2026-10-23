"""D_body of the calibration stroke from a rig screenshot: T = L_body / L_paper
(linearised sRGB), D = -ln T. Body = the stroke's middle rows over a span
along it; paper = rows well above. usage: calib.py shot.png [x0 x1 ybody ypaper]"""
import sys, numpy as np
from PIL import Image
f = sys.argv[1]
x0, x1, yb, yp = (int(v) for v in sys.argv[2:6]) if len(sys.argv) > 5 else (560, 720, 500, 440)
a = np.asarray(Image.open(f).convert('RGB')).astype(float) / 255
lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
L = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
body = L[yb - 4:yb + 5, x0:x1].mean(); paper = L[yp - 8:yp + 9, x0:x1].mean()
# per-channel transmittance too (a blue paint: red channel carries the depth)
Tc = lin[yb - 4:yb + 5, x0:x1].mean(axis=(0, 1)) / lin[yp - 8:yp + 9, x0:x1].mean(axis=(0, 1))
T = body / paper
print(f'{f}: T_body {T:.3f}  D_body {-np.log(T):.3f}   per channel T {Tc.round(3)}  D_r {-np.log(Tc[0]):.3f}')
# the cross-section of D across the stroke at the middle of the span
xm = (x0 + x1) // 2
col = L[yb - 45:yb + 46, xm - 10:xm + 10].mean(axis=1) / paper
print('D across (dy: D):', ' '.join(f'{dy}:{-np.log(max(v,1e-3)):.2f}' for dy, v in zip(range(-45, 46, 3), col[::3])))
