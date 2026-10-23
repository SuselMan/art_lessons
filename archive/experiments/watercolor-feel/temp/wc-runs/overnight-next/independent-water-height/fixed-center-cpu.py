import numpy as np,json,pathlib,hashlib,time
from PIL import Image
r=pathlib.Path('temp/wc-runs/overnight-next');o=r/'independent-water-height';src=r/'wet-context-source23-stages-v3-three-four';frames=json.loads((src/'s4-n1-phase-fields.json').read_text())['frames'];meta=next(f for f in frames if f['stage']=='after-brush-stable' and f['role']=='pigment');H,W=meta['height'],meta['width'];m=meta['mapping'];x0,x1,y0,y1=1240,1816,114,489
X,Y=np.meshgrid(np.arange(x0,x1)+.5,np.arange(y0,y1)+.5);iy=(H-1-((np.arange(y0,y1)+.5-m['y0'])/m['S']).astype(int));ix=((np.arange(x0,x1)+.5-m['x0'])/m['S']).astype(int)
def load(role):return np.fromfile(src/f's4-n1-after-brush-stable-{role}.rgba',np.uint8).reshape(H,W,4)[iy[:,None],ix[None,:],:].astype(float)/255
P,C,cov=load('pigment'),load('color'),load('coverage');V=np.concatenate([P,C],axis=2);ds=json.loads((o/'dabs.json').read_text());masks=[]
for op in ds:
 mask=np.zeros(X.shape,bool)
 for d in op['dabs']:
  # Explicit ellipse-union proxy of recorded poses, no ribbon raster equivalence.
  rr=max(.5,d['size']*.5);rx=rr*d['aspectRatio'];co=np.cos(d['angle']);si=np.sin(d['angle']);px=X-d['x'];py=Y-d['y'];mask|=((px*co+py*si)/rx)**2+((-px*si+py*co)/rr)**2<1
 masks.append(mask)
domain=(cov[:,:,3]>.015)|masks[0]|masks[1];initH=domain.astype(float)+(masks[0]&masks[1]);assert not(domain[0].any() or domain[-1].any() or domain[:,0].any() or domain[:,-1].any());results=[]
for overlap in [1.,.5]:
 h=domain.astype(float)+overlap*(masks[0]&masks[1]);v=V.copy();sum0=v.sum((0,1));h0=h.sum();start=time.time()
 disk=(X-.5-1521.2179)**2+(Y-.5-309.6336)**2<=64;assert disk.sum()==202
 for step in range(1,121):
  dh=np.zeros_like(h);dv=np.zeros_like(v)
  for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
   hj=np.roll(h,(dy,dx),(0,1));vj=np.roll(v,(dy,dx),(0,1));gate=domain&np.roll(domain,(dy,dx),(0,1));F=.1*np.maximum(h-hj,0)*gate;fraction=np.divide(F,h,out=np.zeros_like(h),where=h>0)
   # Identical common8 donor fraction; all recipient channels reserve quarter-room.
   limit=np.minimum(1,np.min(np.divide(np.maximum(1-vj,0)/4,v*fraction[:,:,None],out=np.ones_like(v),where=v*fraction[:,:,None]>0),axis=2));fraction*=limit;flux=h*fraction;ink=v*fraction[:,:,None]
   dh-=flux;dh+=np.roll(flux,(-dy,-dx),(0,1));dv-=ink;dv+=np.roll(ink,(-dy,-dx),(0,1))
  h+=dh;v+=dv;assert h.min()>-1e-10 and v.min()>-1e-10 and v.max()<1+1e-10;assert np.max(abs(v.sum((0,1))-sum0))<1e-6 and abs(h.sum()-h0)<1e-6
  if step in [40,120]:
   diff=v[:,:,2]-V[:,:,2];results.append(dict(fixedCrossingDiskFloatEncodedB=float(v[:,:,2][disk].mean()),fixedCrossingDiskDecodedB=float(2*v[:,:,2][disk].mean()),fixedCrossingDiskInitialDecodedB=float(2*V[:,:,2][disk].mean()),overlapHeight=overlap,steps=step,waterSumResidual=float(h.sum()-h0),eightSumsResidual=(v.sum((0,1))-sum0).tolist(),pigmentBmeanAbsoluteChange=float(abs(diff).mean()),pigmentBmaxChange=float(abs(diff).max()),heightMin=float(h.min()),heightMax=float(h.max()),runtimeSeconds=time.time()-start));None
(o/'report-fixed-crossing-float.json').write_text(json.dumps(dict(scope='CPU float64 independent binary recorded ellipse-union height proxy, cropped actual source23 postbrush fields; NOT actual water amount, shader or renderer',ROI=[x0,y0,x1,y1],oldWaterId=ds[0]['id'],newPigmentId=ds[1]['id'],footprintAssumptions='size*.5, multiplier assumed1 normal; individual pose ellipses not exact ribbon support; closed domain extended by recorded unions',domainPixels=int(domain.sum()),overlapPixels=int((masks[0]&masks[1]).sum()),results=results,controls='3 and7 not activated: exact input/output identity by explicit dispatch, no GPU'),indent=2));print(results)
