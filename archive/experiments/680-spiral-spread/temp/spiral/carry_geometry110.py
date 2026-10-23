import numpy as np,json
N=513;Y,X=np.mgrid[:N,:N]; center=(N-1)/2
radius=55; budget=110;costmax=budget+4;travel=.35;rate=.5
rows=json.load(open('temp/spiral/decoded.json'))
spiral=next(r for r in rows if r['seq']==19)
ds=spiral['ds']; cx=(spiral['box'][0]+spiral['box'][2])/2;cy=(spiral['box'][1]+spiral['box'][3])/2
masks={'dab':(X-center)**2+(Y-center)**2<=radius**2}
m=np.zeros((N,N),bool)
for d in ds:
 x=d['x']-cx+center;y=d['y']-cy+center;r=d['size']/2
 m |= (X-x)**2+(Y-y)**2<=r*r
masks['actual_spiral19']=m
strides=[1,2,4,8,16,32,64,64,32,16,8,4,2,1]
def shift(a,dx,dy):
 b=np.roll(a,(-dy,-dx),(0,1));
 if dx>0:b[:,-dx:]=0
 if dx<0:b[:,:-dx]=0
 if dy>0:b[-dy:,:]=0
 if dy<0:b[:-dy,:]=0
 return b
out={}
for name,mask in masks.items():
 cost=np.where(mask,0.,1.)
 for i in range(budget):
  cost=np.minimum(cost,np.minimum.reduce([shift(cost,1,0),shift(cost,-1,0),shift(cost,0,1),shift(cost,0,-1)])+1/costmax)
  cost[mask]=0;cost[[0,-1],:]=1;cost[:,[0,-1]]=1
 limit=(budget-1.5)/costmax
 t=np.clip(cost/limit,0,1);cap=1-.85*t*t*(3-2*t)
 p=mask.astype(float);p*=10000/p.sum();initial=p.copy()
 eligible=np.zeros_like(mask)
 for s in strides:
  dirs=[(s,0),(-s,0),(0,s),(0,-s)]
  weights=[]
  for dx,dy in dirs:
   cj=shift(cost,dx,dy);delta=(cj-cost)*costmax;tj=np.clip(cj/limit,0,1);fade=(1-tj*tj*(3-2*tj))**1.6
   w=np.where((delta>.001)&(cj<=limit),np.minimum(s/np.maximum(delta,.001),4)**3*fade,0)
   weights.append(w)
  total=np.maximum(sum(weights),1e-20);eligible |= (sum(weights)>0)&mask
  nextp=p.copy();Ti=travel*p/cap
  for (dx,dy),w in zip(dirs,weights):
   capj=shift(cap,dx,dy);Tj=shift(Ti,dx,dy);harm=2*cap*capj/np.maximum(cap+capj,1e-20)
   send=rate*w/total*np.minimum(np.maximum(Ti-Tj,0)*harm,travel*p)
   nextp-=send;nextp+=shift(send,-dx,-dy)
  p=nextp
 out[name]={'source_area':int(mask.sum()),'initial_mass':float(initial.sum()),'final_mass':float(p.sum()),'mass_outside_source_fraction':float(p[~mask].sum()/initial.sum()),'source_cells_ever_have_outward_neighbor_fraction':float(eligible[mask].mean()),'source_extent':[int(np.ptp(X[mask])),int(np.ptp(Y[mask]))]}
print(json.dumps(out,indent=2));json.dump(out,open('temp/spiral/carry-geometry110-results.json','w'),indent=2)
