exec(open('temp/spiral/balance_oracle.py').read().split("for folder in")[0])
results=[]
for name in ['spiral-baseline','blob-baseline']:
 p=root/'interior-strong';row=next(r for r in json.load(open(p/'report.json')) if r['name']==name);meta={s['label']:s for s in row['snapshots']}
 def read(label):
  s=meta[label];return np.fromfile(p/(name+'-'+label+'.raw'),np.uint8).reshape(s['h'],s['w']).astype(float)/255
 cost=read('cost');a=read('post-carry');band=row['carryMeta'][0]['band'];top=64
 blocked=(cost==0)&np.logical_and.reduce([shifted(cost,dx,dy,1)==0 for dx,dy in [(top,0),(-top,0),(0,top),(0,-top)]])
 fed=blocked.copy()
 for s in [16,32,64]:
  for dx,dy in [(s,0),(-s,0),(0,s),(0,-s)]:
   path=(cost==0)&shifted(blocked,dx,dy,False)
   for f in [.25,.5,.75]:path&=shifted(cost,int(dx*f),int(dy*f),1)==0
   fed|=path
 z=np.clip(cost/band,0,1);cap=1-.85*z*z*(3-2*z);potential=0;full=0
 for s in [64,32,16]:
  for dx,dy in [(s,0),(-s,0),(0,s),(0,-s)]:
   cj=shifted(cost,dx,dy,1);aj=shifted(a,dx,dy,0);capj=shifted(cap,dx,dy,1)
   edge=(cj>cost+1e-3/row['carryMeta'][0]['costMax'])&(cj<=band)&(cost==0)
   q=.35*np.minimum(np.maximum(a/cap-aj/capj,0)*2*cap*capj/(cap+capj),a)
   potential+=q[edge&fed].sum();full+=q[edge].sum()
 results.append(dict(name=name,blocked=int(blocked.sum()),fed_mask_pixels=int(fed.sum()),allowed_zero_cost_exit_potential=float(potential),all_zero_cost_exit_potential=float(full),retained_fraction=float(potential/max(full,1e-9))))
json.dump(results,open(root/'resweep-mask-oracle.json','w'),indent=2);print(json.dumps(results,indent=2))
