import sys,json
import numpy as np
from PIL import Image
b=np.array(Image.open(sys.argv[1]).convert('RGBA'));f=np.array(Image.open(sys.argv[2]).convert('RGBA'))
if b.shape!=f.shape:raise RuntimeError('dimension mismatch')
d=np.abs(b.astype(np.int16)-f.astype(np.int16));mask=d.max(2)>0;large=d.max(2)>8
prem=np.abs(b[:,:,:3].astype(np.float32)*b[:,:,3,None]/255-f[:,:,:3].astype(np.float32)*f[:,:,3,None]/255)
alpha=np.maximum(b[:,:,3],f[:,:,3]);maxMask=d.max(2)==d.max();ys,xs=np.where(mask)
print(json.dumps({'pixels':int(mask.sum()),'max':int(d.max()),'RGBmax':int(d[:,:,:3].max()),'alphaMax':int(d[:,:,3].max()),'above8':int(large.sum()),'largeAlphaMax':int(alpha[large].max()) if large.any() else 0,'maxDiffAlphaRange':[int(alpha[maxMask].min()),int(alpha[maxMask].max())],'premultRGBMax':float(prem.max()),'mean':float(d.mean()),'bbox':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())] if len(xs) else None}))
