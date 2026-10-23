from pathlib import Path
import numpy as np,json
p=Path('temp/spiral/gpu');r=json.load(open(p/'report.json'));r=next(x for x in r if x['name']=='spiral-baseline');meta={s['label']:s for s in r['snapshots']}
def read(label):
 s=meta[label];return np.fromfile(p/('spiral-baseline-'+label+'.raw'),np.uint8).reshape(s['h'],s['w'])
cost=read('cost');initial=read('pre-carry');top=64
# Float oracle for the quantised FACE transfer. External field boundary is dry.
def at(a,dx,dy,pad=255):
 b=np.roll(a,(-dy,-dx),(0,1))
 if dx>0:b[:,-dx:]=pad
 if dx<0:b[:,:-dx]=pad
 if dy>0:b[-dy:,:]=pad
 if dy<0:b[:-dy,:]=pad
 return b
blocked=np.logical_and.reduce([at(cost,top,0)==0,at(cost,-top,0)==0,at(cost,0,top)==0,at(cost,0,-top)==0])
a=initial.astype(np.int32);metrics=[]
for stride in [16,32,64]:
 result=a.copy()
 for dx,dy in [(stride,0),(-stride,0),(0,stride),(0,-stride)]:
  path=(cost==0)&(at(cost,dx,dy)==0)
  for f in [.25,.5,.75]:path&=at(cost,int(dx*f),int(dy*f))==0
  path&=blocked|at(blocked,dx,dy,False)
  b=at(a,dx,dy,0);q=np.floor(.08*(a-b)+.5).astype(int) # sign-aware round with opposite signs
  q=np.sign(a-b)*np.floor(.08*np.abs(a-b)+.5).astype(int)
  result-=q*path
 assert result.min()>=0 and result.max()<=255
 assert result.sum()==a.sum(),(result.sum(),a.sum())
 metrics.append({'stride':stride,'mass_before':int(a.sum()),'mass_after':int(result.sum()),'changed_pixels':int((result!=a).sum()),'max_code_change':int(np.max(np.abs(result-a)))})
 a=result
# A compact source with no blocked cells must be a true no-op.
q=next(x for x in json.load(open(p/'report.json')) if x['name']=='blob-baseline');sm={s['label']:s for s in q['snapshots']};s=sm['cost'];blobcost=np.fromfile(p/'blob-baseline-cost.raw',np.uint8).reshape(s['h'],s['w']);b=np.logical_and.reduce([at(blobcost,top,0)==0,at(blobcost,-top,0)==0,at(blobcost,0,top)==0,at(blobcost,0,-top)==0]);metrics.append({'blob_blocked_pixels':int(((blobcost==0)&b).sum())})
json.dump(metrics,open('temp/spiral/interior-oracle.json','w'),indent=2);print(json.dumps(metrics,indent=2))
