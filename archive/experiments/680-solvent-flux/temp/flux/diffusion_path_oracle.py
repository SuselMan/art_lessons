import json,numpy as np
from pathlib import Path
from PIL import Image,ImageFilter
out=Path('temp/flux/diffusion-path');out.mkdir(exist_ok=True);results=[]
small=[(3,False),(2,True)];coarse=[(21,True),(32,False),(14,True),(16,False),(7,True),(8,False)];fine=[(4,False),(3,True),(2,False),(1,True),(1,False)]
for case in ['spiral','blob']:
 path=Path('/home/suselman/projects/pencil-agents/680-spiral-spread/temp/spiral/'+('actual-capture-combined' if case=='spiral' else 'actual-capture-blob'));r=json.load(open(path/'report.json'))[0];fs={x['label']:x for x in r['fields']}
 def read(l):
  f=fs[l];return np.fromfile(path/(case+'-baseline-'+l+'.rgba'),np.uint8).reshape(f['h'],f['w'],4).astype(float)
 p0=read('prefront-P')[...,2];V=read('prefront-V')[...,3];coverage=read('prefront-coverage')[...,3]/255;source=p0>1;wet=(V>0)&(coverage>.002);dist=np.zeros(p0.shape,np.uint8);im=Image.fromarray(source.astype(np.uint8)*255)
 for k in range(1,97):
  prior=np.array(im)>0;im=im.filter(ImageFilter.MaxFilter(3));after=np.array(im)>0;dist[after&~prior]=k
 for concentration,mobility,core,extended in [(False,True,.45,False),(True,True,.45,False),(True,True,0,False),(True,True,0,True)]:
  p=p0.copy();fixed=np.zeros_like(p);s0=p.sum();maxerror=0
  def step(radius,knight):
   global p
   offsets=[(radius,0),(0,radius),(radius,radius),(radius,-radius)] if not knight else [(2*radius,radius),(radius,2*radius),(-radius,2*radius),(-2*radius,radius)]
   change=np.zeros_like(p)
   for dy,dx in offsets:
    ay=slice(max(0,-dy),min(p.shape[0],p.shape[0]-dy));by=slice(max(0,dy),min(p.shape[0],p.shape[0]+dy));ax=slice(max(0,-dx),min(p.shape[1],p.shape[1]-dx));bx=slice(max(0,dx),min(p.shape[1],p.shape[1]+dx));a=(ay,ax);b=(by,bx)
    gate=np.minimum(coverage[a],coverage[b])*wet[a]*wet[b]
    n=max(abs(dy),abs(dx))
    for k in range(1,n):
     ky=int(round(k*dy/n));kx=int(round(k*dx/n));mid=(slice(ay.start+ky,ay.stop+ky),slice(ax.start+kx,ax.stop+kx));gate=np.minimum(gate,coverage[mid]*wet[mid])
    density=np.maximum(2*p[a]/np.maximum(4*V[a],.002*255),2*p[b]/np.maximum(4*V[b],.002*255))
    if mobility:gate/=1+8*density*density
    delta=(np.minimum(V[a],V[b])*(p[a]/np.maximum(V[a],1e-9)-p[b]/np.maximum(V[b],1e-9))) if concentration else p[a]-p[b]
    q=.09*gate*delta;donor=np.where(q>=0,p[a],p[b]);room=np.where(q>=0,255-p[b],255-p[a]);q=np.sign(q)*np.minimum(np.abs(q),np.minimum(donor/8,room/8));change[a]-=q;change[b]+=q
   p+=change
  for radius,k in small:step(radius,k)
  fixed+=core*p;p*=1-core
  for radius,k in (coarse*3 if extended else coarse):
   step(radius,k);fixed+=.2*p;p*=.8
  for radius,k in fine:step(radius,k)
  p+=fixed;outer=(p>8)&~source;dd=dist[outer]
  res=dict(case=case,concentration=concentration,mobility=mobility,core=core,extended=extended,steps=2+(18 if extended else 6)+5,outside=float(p[~source].sum()/s0),massError=float(p.sum()-s0),minimum=float(p.min()),maximum=float(p.max()),frontMax=int(dd.max()) if len(dd) else 0,frontP95=float(np.percentile(dd,95)) if len(dd) else 0,haloPeak=float(p[~source].max()),coreMean=float(p[source].mean()));results.append(res)
  np.savez(out/(case+'-'+str(len(results))+'.npz'),P=p,V=V);print(res,flush=True)
json.dump(results,open(out/'results.json','w'),indent=2)
