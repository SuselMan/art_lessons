from pathlib import Path
import json,numpy as np
p=Path('temp/spiral/marker-resweep');result=[]
def shift(a,dx,dy,pad):
 b=np.roll(a,(-dy,-dx),(0,1))
 if dx>0:b[:,-dx:]=pad
 if dx<0:b[:,:-dx]=pad
 if dy>0:b[-dy:,:]=pad
 if dy<0:b[:-dy,:]=pad
 return b
for r in json.load(open(p/'report.json')):
 if not r['name'].endswith('-marker-on'):continue
 meta={s['label']:s for s in r['snapshots']}
 def read(label):
  s=meta[label];return np.fromfile(p/(r['name']+'-'+label+'.raw'),np.uint8).reshape(s['h'],s['w'])
 cost=read('cost');top=64
 blocked=(cost==0)&np.logical_and.reduce([shift(cost,dx,dy,255)==0 for dx,dy in [(top,0),(-top,0),(0,top),(0,-top)]])
 fed=blocked.copy()
 for st in [16,32,64]:
  for dx,dy in [(st,0),(-st,0),(0,st),(0,-st)]:
   path=(cost==0)&shift(blocked,dx,dy,False)
   for f in [.25,.5,.75]:path&=shift(cost,int(dx*f),int(dy*f),255)==0
   fed|=path
 result.append(dict(name=r['name'],blocked_mismatch=int((read('blocked-marker')!=blocked*255).sum()),fed_mismatch=int((read('fed-marker')!=fed*255).sum()),blocked_count=int(blocked.sum()),fed_count=int(fed.sum())))
json.dump(result,open(p/'marker-proof.json','w'),indent=2);print(json.dumps(result,indent=2))
assert all(r['blocked_mismatch']==r['fed_mismatch']==0 for r in result)
