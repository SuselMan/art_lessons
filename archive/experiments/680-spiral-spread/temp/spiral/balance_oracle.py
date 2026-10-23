from pathlib import Path
import json,numpy as np
root=Path('temp/spiral');results=[]
def shifted(a,dx,dy,pad):
 b=np.roll(a,(-dy,-dx),(0,1));
 if dx>0:b[:,-dx:]=pad
 if dx<0:b[:,:-dx]=pad
 if dy>0:b[-dy:,:]=pad
 if dy<0:b[:-dy,:]=pad
 return b
for folder in ['gpu','interior-strong']:
 rows=json.load(open(root/folder/'report.json'))
 for row in rows:
  if row['name'] not in ['spiral-baseline','blob-baseline']:continue
  meta={s['label']:s for s in row['snapshots']}
  def read(label):
   s=meta[label];return np.fromfile(root/folder/(row['name']+'-'+label+'.raw'),np.uint8).reshape(s['h'],s['w']).astype(float)/255
  cost=read('cost');band=row['carryMeta'][0]['band'];z=np.clip(cost/band,0,1);cap=1-.85*z*z*(3-2*z)
  for label in ['pre-carry','post-carry']:
   a=read(label);tot=a.sum();source=read('pre-carry')>1/255;stats=[]
   for stride in [1,4,16,32,64]:
    permitted=0;blocked=0;flux=0;outflux=0
    for dx,dy in [(stride,0),(-stride,0),(0,stride),(0,-stride)]:
     cj=shifted(cost,dx,dy,1);aj=shifted(a,dx,dy,0);capj=shifted(cap,dx,dy,1)
     edge=(cj>cost+1e-3/row['carryMeta'][0]['costMax'])&(cj<=band)&(cost<=band)&(a>0)
     excess=a/cap-aj/capj;permitted+=int(edge.sum());blocked+=int((edge&(excess<=0)).sum())
     q=.35*np.minimum(np.maximum(excess,0)*2*cap*capj/(cap+capj),a)
     flux+=float(q[edge].sum());outflux+=float(q[edge&source&~shifted(source,dx,dy,False)].sum())
    stats.append(dict(stride=stride,edges=permitted,at_equilibrium_fraction=blocked/max(permitted,1),potential_flux_over_mass=flux/tot,potential_source_exit_over_mass=outflux/tot))
   results.append(dict(folder=folder,case=row['name'],stage=label,stats=stats))
json.dump(results,open(root/'balance-oracle.json','w'),indent=2)
for r in results:
 print(r['folder'],r['case'],r['stage'],[(s['stride'],round(s['at_equilibrium_fraction'],3),round(s['potential_source_exit_over_mass'],4)) for s in r['stats']])
