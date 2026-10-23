import numpy as np,json
from pathlib import Path
out=Path('temp/spiral/solvent-volume');out.mkdir(exist_ok=True)
contacts=json.load(open('temp/spiral/brush-contacts.json'));results=[]
for shape in ['spiral','blob']:
 data=np.load('temp/spiral/solvent-oracle/'+shape+'.npz');base=data['water'];initial=data['initial'];source=data['source'];mask=base>.015;H,W=base.shape
 # Contact density reconstructed from captured contact clock. Source is bounded, in same loaded-contact units as main solvent film.
 cs=next(c['contacts'] for c in contacts if c['shape']==shape)
 exposure=source.astype(float) if cs else np.zeros_like(base)
 for budget in [0,.25,.5,1,2]:
  water=base.copy();extra=budget*base[source].sum();addition=exposure*extra/max(exposure.sum(),1);addition=np.minimum(addition,4-water);water+=addition
  rng=np.random.default_rng(680);pigment=initial[...,None]*np.concatenate([np.ones((H,W,1)),rng.uniform(.1,.8,(H,W,7))],2);m0=pigment.sum((0,1));w0=water.sum();uniform=water[...,None]*np.arange(1,9)[None,None,:]/8
  ex=mask[:,:-1]&mask[:,1:];ey=mask[:-1,:]&mask[1:,:]
  for tick in range(240):
   fx=.12*(water[:,:-1]-water[:,1:])*ex;fy=.12*(water[:-1,:]-water[1:,:])*ey
   outgoing=np.zeros_like(water);outgoing[:,:-1]+=np.maximum(fx,0);outgoing[:,1:]+=np.maximum(-fx,0);outgoing[:-1,:]+=np.maximum(fy,0);outgoing[1:,:]+=np.maximum(-fy,0)
   scale=np.minimum(1,.45*water/np.maximum(outgoing,1e-15));fx*=np.where(fx>=0,scale[:,:-1],scale[:,1:]);fy*=np.where(fy>=0,scale[:-1,:],scale[1:,:])
   def advance(a):
    c=a/np.maximum(water[...,None],1e-15);qx=fx[...,None]*np.where(fx[...,None]>=0,c[:,:-1],c[:,1:]);qy=fy[...,None]*np.where(fy[...,None]>=0,c[:-1,:],c[1:,:]);b=a.copy();b[:,:-1]-=qx;b[:,1:]+=qx;b[:-1,:]-=qy;b[1:,:]+=qy;return b
   pigment=advance(pigment);uniform=advance(uniform);water[:,:-1]-=fx;water[:,1:]+=fx;water[:-1,:]-=fy;water[1:,:]+=fy
  result=dict(shape=shape,budget=budget,added_water=float(addition.sum()),outside_fraction=float(pigment[...,0][~source].sum()/initial.sum()),mass_errors=(pigment.sum((0,1))-m0).tolist(),water_error=float(water.sum()-w0),uniform_error=float(np.max(np.abs(uniform-water[...,None]*np.arange(1,9)[None,None,:]/8))),min_pigment=float(pigment.min()),max_volume=float(water.max()))
  results.append(result);np.savez(out/(shape+'-'+str(budget)+'.npz'),water=water,pigment=pigment,initial=initial);print(result,flush=True)
json.dump(results,open(out/'results.json','w'),indent=2)
