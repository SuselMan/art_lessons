"""Offline pigment-displacement preview; no engine fields or endpoint PNGs changed."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageFilter

SOURCE = Path(__file__).resolve().parents[1] / 'transition_preview/assets'
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
N = 900000
FRAMES = 49
# Same deterministic quantiles in both images establish material correspondence.
u = (np.arange(N) + .5) / N
v = np.mod(np.arange(N) * .6180339887498949 + .5, 1)

def data(path):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im, dtype=np.float64) / 255
    color = (1-a[:, :, :3])*a[:, :, 3:4]
    mass = color.mean(2)
    return im, color, mass

def quantiles(mass, color):
    h, w = mass.shape
    total = mass.sum()
    marginal = mass.sum(1)
    cum = np.r_[0, np.cumsum(marginal)] / total
    y = np.interp(u, cum, np.arange(h+1))-.5
    row = np.clip(np.floor(y+.5).astype(int), 0, h-1)
    x = np.empty(N)
    colors = np.empty((N, 3))
    for r in np.unique(row):
        ids = np.flatnonzero(row == r)
        cdf = np.r_[0, np.cumsum(mass[r])] / max(marginal[r], 1e-12)
        x[ids] = np.interp(v[ids], cdf, np.arange(w+1))-.5
        col = np.clip(np.floor(x[ids]+.5).astype(int), 0, w-1)
        colors[ids] = color[r,col] / np.maximum(mass[r,col,None], 1e-12)
    return np.c_[x,y], colors, total

def render(position, colors, mass, size):
    w, h = size
    x = np.clip(position[:,0], 0, w-1)
    y = np.clip(position[:,1], 0, h-1)
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    dx, dy = x-xi, y-yi
    result = np.zeros((h*w,3))
    for ox,oy,weight in [(0,0,(1-dx)*(1-dy)),(1,0,dx*(1-dy)),(0,1,(1-dx)*dy),(1,1,dx*dy)]:
        idx = np.minimum(yi+oy,h-1)*w + np.minimum(xi+ox,w-1)
        for channel in range(3):
            result[:,channel] += np.bincount(idx, weights=colors[:,channel]*weight*mass/N, minlength=h*w)
    rgb = np.rint(np.clip(1-result.reshape(h,w,3),0,1)*255).astype('uint8')
    return Image.fromarray(rgb)

manifest = []
for case in json.loads((SOURCE/'cases.json').read_text())['cases']:
    wet,cw,mw = data(SOURCE/case['wet']); dry,cd,md = data(SOURCE/case['dry'])
    pw,kw,tw = quantiles(mw,cw); pd,kd,td = quantiles(md,cd)
    folder=OUT/case['id']; folder.mkdir(exist_ok=True)
    # Original endpoint bytes are copied verbatim and always used at t=0 and t=1.
    for key in ['wet','dry']:
        (folder/f'{key}.png').write_bytes((SOURCE/case[key]).read_bytes())
    frames=[]
    for index in range(FRAMES):
        t=index/(FRAMES-1)
        if index in [0,FRAMES-1]:
            im=wet if index==0 else dry
            bg=Image.new('RGBA',im.size,'white'); bg.alpha_composite(im); im=bg.convert('RGB')
        else:
            im=render(pw*(1-t)+pd*t,kw*(1-t)+kd*t,tw*(1-t)+td*t,wet.size)
        im.save(folder/f'{index:03}.webp',quality=94)
        frames.append(im)
    frames[0].save(folder/'transport.webp',save_all=True,append_images=frames[1:],duration=163,loop=0,quality=92)
    collage=Image.new('RGB',(wet.width*4,wet.height),'white')
    for j,idx in enumerate([0,12,30,48]):collage.paste(frames[idx],(j*wet.width,0))
    collage.save(folder/'timeline.jpg',quality=94)
    dist=np.linalg.norm(pd-pw,axis=1)
    endpoint=render(pd,kd,td,dry.size)
    drybg=Image.new('RGBA',dry.size,'white');drybg.alpha_composite(dry)
    delta=np.abs(np.asarray(endpoint).astype(int)-np.asarray(drybg.convert('RGB')).astype(int))
    manifest.append({'id':case['id'],'label':case['label'],'frames':FRAMES,'particles':N,
      'displacementPx':{'median':float(np.median(dist)),'p95':float(np.percentile(dist,95)),'max':float(dist.max())},
      'lastReconstructionError':{'mean':float(delta.mean()),'p99':float(np.percentile(delta,99)),'max':int(delta.max())},
      'sha256':{key:hashlib.sha256((folder/f'{key}.png').read_bytes()).hexdigest() for key in ['wet','dry']}})
    print(json.dumps(manifest[-1],ensure_ascii=False),flush=True)
(OUT/'cases.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
