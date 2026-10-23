import numpy as np,json
from pathlib import Path
p=Path(__file__).parent
r=[]
for name in ['direct','prewater','spiral-baseline','blob-baseline']:
 report=json.load(open(p/'carrier-density-baseline'/'report.json'))
 row=next(x for x in report if x['variant']==name);w=row['fields']['deposit']['w'];h=row['fields']['deposit']['h']
 ink=np.fromfile(p/'carrier-density-baseline'/f'{name}-deposit.rgba',np.uint8).reshape(h,w,4)/255.
 cov=np.fromfile(p/'carrier-density-baseline'/f'{name}-coverage.rgba',np.uint8).reshape(h,w,4)/255.
 outputs=[]
 for channel in [3,2]:
  out=ink.copy();density=2*ink[:,:,channel]/np.maximum(cov[:,:,3],.002);wet=np.where(cov[:,:,3]>.002,np.minimum(cov[:,:,3],1),0)
  for dy,dx in [(0,1),(0,-1),(1,0),(-1,0),(1,1),(-1,1),(1,-1),(-1,-1)]:
   ni=np.roll(ink,(dy,dx),(0,1));nd=np.roll(density,(dy,dx),(0,1));nw=np.roll(wet,(dy,dx),(0,1));gate=np.minimum(wet,nw)/(1+8*np.maximum(density,nd)**2)
   if dy>0:gate[:dy,:]=0
   if dy<0:gate[dy:,:]=0
   if dx>0:gate[:,:dx]=0
   if dx<0:gate[:,dx:]=0
   out+=.04*gate[:,:,None]*(ni-ink)
  outputs.append(out)
 r.append(dict(name=name,input_mass=ink.sum((0,1)).tolist(),carrier_density_mass=outputs[0].sum((0,1)).tolist(),pigment_density_mass=outputs[1].sum((0,1)).tolist(),pigment_redistribution_L1=float(abs(outputs[1][:,:,2]-outputs[0][:,:,2]).sum())))
(p/'carrier-oracle.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
