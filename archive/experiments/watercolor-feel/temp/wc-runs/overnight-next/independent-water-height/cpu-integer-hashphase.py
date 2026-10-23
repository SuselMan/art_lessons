import numpy as np,json,pathlib,hashlib,time
from PIL import Image
r=pathlib.Path('temp/wc-runs/overnight-next');o=r/'independent-water-height-integer-hashphase';o.mkdir(exist_ok=True);src=r/'wet-context-source23-stages-v3-three-four';frames=json.loads((src/'s4-n1-phase-fields.json').read_text())['frames'];meta=next(f for f in frames if f['stage']=='after-brush-stable' and f['role']=='pigment');H,W=meta['height'],meta['width'];m=meta['mapping'];x0,x1,y0,y1=1240,1816,114,489
X,Y=np.meshgrid(np.arange(x0,x1)+.5,np.arange(y0,y1)+.5);iy=(H-1-((np.arange(y0,y1)+.5-m['y0'])/m['S']).astype(int));ix=((np.arange(x0,x1)+.5-m['x0'])/m['S']).astype(int)
def load(role):return np.fromfile(src/f's4-n1-after-brush-stable-{role}.rgba',np.uint8).reshape(H,W,4)[iy[:,None],ix[None,:],:].astype(float)/255
P,C,cov=load('pigment'),load('color'),load('coverage');V=np.concatenate([P,C],axis=2);ds=json.loads((r/'independent-water-height/dabs.json').read_text());masks=[]
for op in ds:
 mask=np.zeros(X.shape,bool)
 for d in op['dabs']:
  # Explicit ellipse-union proxy of recorded poses, no ribbon raster equivalence.
  rr=max(.5,d['size']*.5);rx=rr*d['aspectRatio'];co=np.cos(d['angle']);si=np.sin(d['angle']);px=X-d['x'];py=Y-d['y'];mask|=((px*co+py*si)/rx)**2+((-px*si+py*co)/rr)**2<1
 masks.append(mask)
domain=(cov[:,:,3]>.015)|masks[0]|masks[1];initH=domain.astype(float)+(masks[0]&masks[1]);assert not(domain[0].any() or domain[-1].any() or domain[:,0].any() or domain[:,-1].any());
domain=cov[:,:,3]>0; h=domain.astype(float)+(masks[0]&masks[1]&domain);v=np.rint(V*255).astype(np.int64);initial=v.copy();sum0=v.sum((0,1));h0=h.sum(); YY,XX=np.indices(domain.shape);flat=np.arange(domain.size).reshape(domain.shape);disk=(X-.5-1521.2179)**2+(Y-.5-309.6336)**2<=64;assert disk.sum()==202
stats=[];tick=0;start=time.time()
for step in range(1,121):
 hop=[6,7,8,9,10,11][(step-1)%6]
 axes=[0,1] if step%2 else [1,0]
 for axis in axes:
  for parity in ([0,1] if step%2 else [1,0]):
   pos=YY if axis==0 else XX;maxpos=domain.shape[axis];eligible=((pos//hop)%2==parity)&(pos+hop<maxpos)&domain
   for k in range(1,hop+1):eligible &= np.roll(domain,-k,axis=axis)
   aa=flat[eligible];bb=aa+(hop*domain.shape[1] if axis==0 else hop)
   assert len(np.unique(np.concatenate([aa,bb])))==2*len(aa)
   hh=h.reshape(-1);vv=v.reshape(-1,8);high=hh[aa]>=hh[bb];donor=np.where(high,aa,bb);recipient=np.where(high,bb,aa);q=vv[donor].copy();room=255-vv[recipient];diff=hh[donor]-hh[recipient];fraction=np.divide(.1*diff,hh[donor],out=np.zeros_like(diff),where=hh[donor]>0)
   limit=np.minimum(1,np.min(np.divide(room,q*fraction[:,None],out=np.ones_like(q,dtype=float),where=q*fraction[:,None]>0),axis=1));fraction*=limit
   # One shared deterministic pair phase for all8 channels; no sum repair.
   pairX=(aa%domain.shape[1]+1240).astype(np.uint64);pairY=(aa//domain.shape[1]+114).astype(np.uint64);pairX2=(bb%domain.shape[1]+1240).astype(np.uint64);pairY2=(bb//domain.shape[1]+114).astype(np.uint64)
   key=((pairX*0x9e3779b1)^(pairY*0x85ebca77)^(pairX2*0xc2b2ae3d)^(pairY2*0x27d4eb2f)^np.uint64((tick*0x165667b1)&0xffffffff))&np.uint64(0xffffffff)
   key ^= key>>np.uint64(16);key=(key*np.uint64(0x7feb352d))&np.uint64(0xffffffff);key ^= key>>np.uint64(15);key=(key*np.uint64(0x846ca68b))&np.uint64(0xffffffff);key ^= key>>np.uint64(16)
   phase=(key.astype(float)+.5)/4294967296;take=np.floor(q*fraction[:,None]+phase[:,None]).astype(np.int64);assert (take>=0).all() and (take<=q).all() and (take<=room).all()
   water=hh[donor]*fraction;hh[donor]-=water;hh[recipient]+=water;vv[donor]-=take;vv[recipient]+=take;tick+=1
   assert (v>=0).all() and (v<=255).all() and np.array_equal(v.sum((0,1)),sum0) and abs(h.sum()-h0)<1e-6
 if step in [40,120]:
  pbca=int(np.max(abs(v[:,:,2]-v[:,:,7])));outside=int(v[:,:,2][~domain].sum());ratioBefore=np.divide(initial[:,:,0],initial[:,:,3],out=np.zeros_like(h),where=initial[:,:,3]>0);ratioAfter=np.divide(v[:,:,0],v[:,:,3],out=np.zeros_like(h),where=v[:,:,3]>0);mask=(initial[:,:,3]>0)&(v[:,:,3]>0)
  stats.append(dict(steps=step,centerInitialDecodedB=float(initial[:,:,2][disk].mean()*2/255),centerDecodedB=float(v[:,:,2][disk].mean()*2/255),centerRelativeReduction=float(1-v[:,:,2][disk].mean()/initial[:,:,2][disk].mean()),all8SumDelta=(v.sum((0,1))-sum0).tolist(),waterSumResidual=float(h.sum()-h0),maxPBminusCA=pbca,outsideOriginalDomainPigmentCodes=outside,waterCarrierRatioChangeMean=float(np.mean(abs(ratioAfter-ratioBefore)[mask])),runtimeSeconds=time.time()-start));Image.fromarray(v[:,:,2].astype(np.uint8)).save(o/f'steps{step}-P-B.png')
assert np.array_equal(initial[:,:,2],initial[:,:,7]);assert np.array_equal(v[:,:,2],v[:,:,7]);assert (v[~domain]==initial[~domain]).all()
np.save(o/'final-eight-channels.npy',v);np.save(o/'original-coverage.npy',cov);np.save(o/'model-domain.npy',domain);Image.fromarray(initial[:,:,2].astype(np.uint8)).save(o/'before-P-B.png');(o/'report.json').write_text(json.dumps(dict(scope='CPU integer disjoint pair exchange, stable32bit-avalanche shared phase, original coverage A>0 only; no renderer equivalence; variablehop6..11 and sequential four phase sweeps change numerical horizon',steps=120,ticks=tick,results=stats,source=str(src),sourceStages='after-brush-stable',noGPU=True),indent=2));print(stats)
