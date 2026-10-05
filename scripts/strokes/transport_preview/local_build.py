"""Offline local pigment transport restricted to a connected wet-support mask.
Not physical water motion: the support comes from captured endpoint pigment.
"""
import hashlib
import json
from collections import deque
from pathlib import Path
import sys
import cv2
import numpy as np
from PIL import Image

SOURCE = Path(__file__).resolve().parents[1] / 'transition_preview/assets'
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PARTICLES=900000
FRAMES=65
CELL=48
OFFSETS=[(0,0),(24,0),(0,24),(24,24)]

def data(path):
    im=Image.open(path).convert('RGBA')
    a=np.asarray(im,dtype=float)/255
    absorb=(1-a[:,:,:3])*a[:,:,3:4]
    return im,absorb,absorb.mean(2)

def quantiles(mass,color,n):
    h,w=mass.shape;total=mass.sum()
    if total < 1e-10:return None
    u=(np.arange(n)+.5)/n
    v=np.mod(np.arange(n)*.6180339887498949+.5,1)
    rowmass=mass.sum(1)
    y=np.interp(u,np.r_[0,np.cumsum(rowmass)]/total,np.arange(h+1))-.5
    row=np.clip(np.floor(y+.5).astype(int),0,h-1)
    x=np.empty(n);spectrum=np.empty((n,3))
    for r in np.unique(row):
        ids=np.flatnonzero(row==r)
        x[ids]=np.interp(v[ids],np.r_[0,np.cumsum(mass[r])]/rowmass[r],np.arange(w+1))-.5
        cols=np.clip(np.floor(x[ids]+.5).astype(int),0,w-1)
        spectrum[ids]=color[r,cols]/np.maximum(mass[r,cols,None],1e-12)
    return np.c_[x,y],spectrum,total/n

def inside(position,mask):
    h,w=mask.shape
    ij=np.clip(np.floor(position+.5).astype(int),[0,0],[w-1,h-1])
    return mask[ij[:,1],ij[:,0]] != 0

def routed(start,end,mask):
    """Straight local trajectories; BFS detour only when the segment exits support."""
    h,w=mask.shape
    direct=np.ones(len(start),dtype=bool)
    for t in np.linspace(0,1,25):direct &= inside(start*(1-t)+end*t,mask)
    ids=np.flatnonzero(~direct)
    routes=np.empty((FRAMES,len(ids),2))
    if not len(ids):return ids,routes
    a=np.clip(np.floor(start[ids]+.5).astype(int),[0,0],[w-1,h-1])
    b=np.clip(np.floor(end[ids]+.5).astype(int),[0,0],[w-1,h-1])
    # Quantile interpolation can fall in zero-density gaps. Move endpoints to
    # nearest support pixel before routing; correction is at most one pixel.
    allowed=np.argwhere(mask)
    for coords in [a,b]:
        bad=~mask[coords[:,1],coords[:,0]].astype(bool)
        for j in np.flatnonzero(bad):
            delta=allowed[:,::-1]-coords[j]
            coords[j]=allowed[np.argmin((delta*delta).sum(1)),::-1]
    for origin in np.unique(a,axis=0):
        selected=np.flatnonzero((a==origin).all(1))
        parents={tuple(origin):None};queue=deque([tuple(origin)])
        while queue:
            x,y=queue.popleft()
            for nx,ny in [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]:
                if 0<=nx<w and 0<=ny<h and mask[ny,nx] and (nx,ny) not in parents:
                    parents[nx,ny]=(x,y);queue.append((nx,ny))
        for target in np.unique(b[selected],axis=0):
            match=selected[(b[selected]==target).all(1)]
            path=[];p=tuple(target)
            if p not in parents:raise RuntimeError('Disconnected path within local component')
            while p is not None:path.append(p);p=parents[p]
            path=np.asarray(path[::-1],dtype=float)
            fraction=np.linspace(0,len(path)-1,FRAMES)
            for axis in [0,1]:
                routes[:,match,axis]=np.interp(fraction,np.arange(len(path)),path[:,axis])[:,None]
    routes[0]=start[ids];routes[-1]=end[ids]
    return ids,routes

def particles(cw,mw,cd,md):
    h,w=mw.shape
    support=cv2.morphologyEx(((mw+md)>.001).astype('uint8'),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    support |= ((mw+md)>0).astype('uint8')
    starts=[];ends=[];colours0=[];colours1=[];weights0=[];weights1=[];routes=[];routeids=[]
    count=0
    norm=((mw+md)/2).sum()
    for ox,oy in OFFSETS:
        for y0 in range(-oy,h,CELL):
            for x0 in range(-ox,w,CELL):
                x1=max(x0,0);x2=min(x0+CELL,w);y1=max(y0,0);y2=min(y0+CELL,h)
                if x1>=x2 or y1>=y2:continue
                local=support[y1:y2,x1:x2]
                ncomp,labels=cv2.connectedComponents(local,connectivity=4)
                for component in range(1,ncomp):
                    mask=(labels==component).astype('uint8')
                    aw=mw[y1:y2,x1:x2]*mask;ad=md[y1:y2,x1:x2]*mask
                    mass=(aw.sum()+ad.sum())/2
                    if mass<1e-8:continue
                    n=max(4,round(PARTICLES*mass/norm/len(OFFSETS)))
                    a=quantiles(aw,cw[y1:y2,x1:x2],n);b=quantiles(ad,cd[y1:y2,x1:x2],n)
                    if a is None:a=(b[0].copy(),b[1].copy(),0)
                    if b is None:b=(a[0].copy(),a[1].copy(),0)
                    offset=np.array([x1,y1])
                    ids,route=routed(a[0],b[0],mask)
                    starts.append(a[0]+offset);ends.append(b[0]+offset)
                    colours0.append(a[1]);colours1.append(b[1])
                    weights0.append(np.full(n,a[2]/len(OFFSETS)));weights1.append(np.full(n,b[2]/len(OFFSETS)))
                    if len(ids):routeids.append(ids+count);routes.append(route+offset)
                    count+=n
    return (np.concatenate(starts),np.concatenate(ends),np.concatenate(colours0),np.concatenate(colours1),
        np.concatenate(weights0),np.concatenate(weights1),
        np.concatenate(routeids) if routeids else np.array([],dtype=int),
        np.concatenate(routes,axis=1) if routes else np.empty((FRAMES,0,2)),support)

def splat(position,color,weight,size,support):
    w,h=size;x=np.clip(position[:,0],0,w-1);y=np.clip(position[:,1],0,h-1)
    xi,yi=np.floor(x).astype(int),np.floor(y).astype(int);dx,dy=x-xi,y-yi
    result=np.zeros((h*w,3))
    for ox,oy,blend in [(0,0,(1-dx)*(1-dy)),(1,0,dx*(1-dy)),(0,1,(1-dx)*dy),(1,1,dx*dy)]:
        idx=np.minimum(yi+oy,h-1)*w+np.minimum(xi+ox,w-1)
        for ch in range(3):result[:,ch]+=np.bincount(idx,weights=color[:,ch]*blend*weight,minlength=h*w)
    result=result.reshape(h,w,3);result[~support.astype(bool)]=0
    return result

manifest=[]
for case in json.loads((SOURCE/'cases.json').read_text())['cases']:
    wet,cw,mw=data(SOURCE/case['wet']);dry,cd,md=data(SOURCE/case['dry'])
    pw,pd,kw,kd,tw,td,rids,rpaths,support=particles(cw,mw,cd,md)
    start_reconstruction=splat(pw,kw,tw,wet.size,support)
    end_reconstruction=splat(pd,kd,td,dry.size,support)
    # Fixed high-frequency reconstruction residual preserves exact endpoints;
    # it corrects sampling/paper detail, not the coarse moving pigment.
    residual0=cw-start_reconstruction;residual1=cd-end_reconstruction
    folder=OUT/case['id'];folder.mkdir(exist_ok=True)
    for key in ['wet','dry']:(folder/f'{key}.png').write_bytes((SOURCE/case[key]).read_bytes())
    frames=[];outside=0;maxstep=0;lastpos=None
    for index in range(FRAMES):
        t=index/(FRAMES-1)
        position=pw*(1-t)+pd*t
        position[rids]=rpaths[index]
        outside+=int((~inside(position,support)).sum())
        if lastpos is not None:maxstep=max(maxstep,float(np.linalg.norm(position-lastpos,axis=1).max()))
        lastpos=position.copy()
        density=splat(position,kw*(1-t)+kd*t,tw*(1-t)+td*t,wet.size,support)
        density+=residual0*(1-t)+residual1*t
        # No coloured pixels may appear outside the endpoint support.
        density[~support.astype(bool)]=0
        rgb=np.rint(np.clip(1-density,0,1)*255).astype('uint8')
        im=Image.fromarray(rgb);im.save(folder/f'{index:03}.webp',lossless=True);frames.append(im)
    frames[0].save(folder/'transport.webp',save_all=True,append_images=frames[1:],duration=125,loop=0,lossless=True)
    collage=Image.new('RGB',(wet.width*4,wet.height),'white')
    for j,idx in enumerate([0,16,40,64]):collage.paste(frames[idx],(j*wet.width,0))
    collage.save(folder/'timeline.jpg',quality=94)
    dist=np.linalg.norm(pd-pw,axis=1)
    entry={'id':case['id'],'label':case['label'],'frames':FRAMES,'particles':len(pw),'cellPx':CELL,
        'routedParticles':len(rids),'outsideSupportSamples':outside,'maxFrameParticleStepPx':maxstep,
        'displacementPx':{'median':float(np.median(dist)),'p95':float(np.percentile(dist,95)),'max':float(dist.max())},
        'endpointReconstructionError':{'wet':float(np.abs(cw-(start_reconstruction+residual0)).max()),'dry':float(np.abs(cd-(end_reconstruction+residual1)).max())},
        'sha256':{key:hashlib.sha256((folder/f'{key}.png').read_bytes()).hexdigest() for key in ['wet','dry']}}
    manifest.append(entry);print(json.dumps(entry,ensure_ascii=False),flush=True)
(OUT/'cases.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
