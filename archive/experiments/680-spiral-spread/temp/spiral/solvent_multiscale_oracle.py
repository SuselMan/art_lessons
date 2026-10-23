import numpy as np,json
from pathlib import Path
out=Path('temp/spiral/solvent-multiscale');out.mkdir(exist_ok=True);results=[]
for shape in ['spiral','blob']:
 data=np.load('temp/spiral/solvent-oracle/'+shape+'.npz');base=data['water'];initial=data['initial'];source=data['source'];mask=base>.015;H,W=base.shape
 for closure in ['constant','legacy-alpha','concentration']:
  for scheme in ['local','multiscale']:
   water=base.copy();addition=source.astype(float)*base[source].sum()/max(source.sum(),1) if shape=='spiral' else np.zeros_like(base);water+=addition
   pigment=initial.copy();w0=water.sum();m0=pigment.sum();uniform=water.copy();passes=0;reads=0
   schedule=[1]*48 if scheme=='local' else [16,8,4,2,1]*10
   for stride in schedule:
    # Long connections permitted only when every intermediate cell belongs to wet domain.
    for axis in [0,1]:
     if stride>=water.shape[axis]:continue
     a=[slice(None),slice(None)];b=a.copy();a[axis]=slice(0,-stride);b[axis]=slice(stride,None);a=tuple(a);b=tuple(b)
     edge=mask[a]&mask[b]
     for k in range(1,stride):
      sl=[slice(None),slice(None)];sl[axis]=slice(k,water.shape[axis]-stride+k);edge&=mask[tuple(sl)]
     if closure=='constant':mobility=np.ones_like(pigment)
     elif closure=='legacy-alpha':mobility=1/(1+3*initial)
     else:mobility=1/(1+3*pigment/np.maximum(water,.015))
     # A coarse edge transports solvent according to coarse head difference, never pigment alone.
     flux=.2*(water[a]-water[b])*edge*np.minimum(mobility[a],mobility[b])
     outgoing=np.zeros_like(water);outgoing[a]+=np.maximum(flux,0);outgoing[b]+=np.maximum(-flux,0)
     scale=np.minimum(1,.45*water/np.maximum(outgoing,1e-15));flux*=np.where(flux>=0,scale[a],scale[b])
     def advect(state):
      c=state/np.maximum(water,1e-15);q=flux*np.where(flux>=0,c[a],c[b]);r=state.copy();r[a]-=q;r[b]+=q;return r
     pigment=advect(pigment);uniform=advect(uniform);water[a]-=flux;water[b]+=flux;passes+=1;reads+=int(edge.size)*(stride+4)
   results.append(dict(shape=shape,closure=closure,scheme=scheme,passes=passes,outside_fraction=float(pigment[~source].sum()/m0),mass_error=float(pigment.sum()-m0),water_error=float(water.sum()-w0),uniform_error=float(np.max(np.abs(uniform-water))),minimum=float(pigment.min()),logical_edge_reads=reads))
   np.savez(out/(shape+'-'+closure+'-'+scheme+'.npz'),water=water,pigment=pigment)
json.dump(results,open(out/'results.json','w'),indent=2)
for r in results:print(r)
