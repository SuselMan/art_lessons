import json,numpy as np
from pathlib import Path
out=Path('temp/flux/current-base-capture');results=[]
for case in ['spiral','blob']:
 path=Path('temp/flux/current-base-capture');r=next(x for x in json.load(open(path/'report.json')) if x['name']==case+'-flux');fs={x['label']:x for x in r['fields']}
 def read(l):
  f=fs[l];return np.fromfile(path/(case+'-flux-'+l+'.rgba'),np.uint8).reshape(f['h'],f['w'],4).astype(np.float64)
 v0=read('pre-V')[...,3];base=read('pre-baseV')[...,3];p0=read('pre-P');gate=v0>0;source=p0[...,2]>1
 cost=read('front-cost')[...,0];costMax=r['costScale'];floorByte=np.ceil(.85*255/costMax)
 for gain in [0,.05,.1]:
  zero=False
  v=base.copy() if zero else v0.copy();p=p0.copy();m0=p.sum((0,1));sumv=v.sum();minp=255
  for stride in [4]*12:
   for axis in [0,1]:
    a=[slice(None),slice(None)];b=a.copy();a[axis]=slice(0,-stride);b[axis]=slice(stride,None);a=tuple(a);b=tuple(b)
    wet=(v*4/255>=.015)&gate;edge=wet[a]&wet[b]
    for k in range(1,stride):
     sl=[slice(None),slice(None)];sl[axis]=slice(k,v.shape[axis]-stride+k);edge&=wet[tuple(sl)]
    resistance=np.zeros_like(edge,dtype=float);previous=cost[a]
    for k in range(1,stride+1):
     sl=[slice(None),slice(None)];sl[axis]=slice(k,v.shape[axis]-stride+k);current=cost[tuple(sl)];resistance+=np.maximum(np.abs(current-previous)-floorByte,0);previous=current
    reverse=np.zeros_like(resistance);previous=cost[b]
    for k in range(stride-1,-1,-1):
     sl=[slice(None),slice(None)];sl[axis]=slice(k,v.shape[axis]-stride+k);current=cost[tuple(sl)];reverse+=np.maximum(np.abs(current-previous)-floorByte,0);previous=current
    assert np.array_equal(resistance,reverse), 'face resistance is asymmetric'
    conductivity=1/(1+gain*resistance*costMax/(255*stride))
    head=np.maximum(0,v-base);mob=1/(1+3*p[...,2]/np.maximum(4*v,.015*255));signed=.2*((head[a]-head[b])+gain*(cost[b]-cost[a])*costMax/4)*edge*np.minimum(mob[a],mob[b]);donorhead=np.where(signed>=0,head[a],head[b]);donorv=np.where(signed>=0,v[a],v[b]);recvv=np.where(signed>=0,v[b],v[a]);donorp=np.where((signed>=0)[...,None],p[a],p[b]);recvp=np.where((signed>=0)[...,None],p[b],p[a]);room=.5*(255-recvp)*donorv[...,None]/np.maximum(donorp,1e-6);q=np.floor(np.minimum(np.minimum(np.minimum(np.abs(signed),.2*donorhead),.5*(255-recvv)),room.min(2))+1e-5);q*=np.sign(signed)
    transfer=np.floor(donorp*np.abs(q)[...,None]/np.maximum(donorv[...,None],.015*255/4)+1e-5)*np.sign(q)[...,None];newp=p.copy();newp[a]-=transfer;newp[b]+=transfer;newv=v.copy();newv[a]-=q;newv[b]+=q;p=newp;v=newv
  result=dict(case=case,paperGain=gain,frontCostSource='current independent V cost, small synthetic fixture',outside=float(p[...,2][~source].sum()/m0[2]),masserror=(p.sum((0,1))-m0).tolist(),watererror=float(v.sum()-sumv),minimum=float(p.min()),maximum=float(p.max()),volumeMinimum=float(v.min()),volumeMaximum=float(v.max()),exactNoop=bool(np.array_equal(p,p0)),negativeHead=int((v<base).sum()));results.append(result);np.savez(out/(case+'-capillary-'+str(gain)+'.npz'),P=p,V=v)
json.dump(results,open(out/'capillary-byte-results.json','w'),indent=2)
for r in results:print(r)
