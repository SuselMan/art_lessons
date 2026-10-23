import numpy as np, json
N=129; yy,xx=np.mgrid[:N,:N]; r=np.hypot(xx-64,yy-64); R=24; budget=18
pig=np.clip(R+.6-r,0,1)*.55
cost=np.clip(np.maximum(r-R,0)/(budget+4),0,1)
# Antialiased seed maps a pigment fringe through the same smooth ramp as mode10.
t=np.clip((2*pig-.003)/.009,0,1); smooth=t*t*(3-2*t)
cost=np.maximum(cost,(1-smooth)/(budget+4))
cap=1-.85*(np.clip(cost/((budget-1.5)/(budget+4)),0,1)**2*(3-2*np.clip(cost/((budget-1.5)/(budget+4)),0,1)))
lim=(budget-1.5)/(budget+4)
def shifted(a,dx,dy):
 out=np.roll(a,(dy,dx),(0,1))
 if dx>0:out[:,:dx]=0
 if dx<0:out[:,dx:]=0
 if dy>0:out[:dy,:]=0
 if dy<0:out[dy:,:]=0
 return out
def evolve(equal):
 a=pig.copy(); mass0=a.sum()
 for s in [1,2,4,8,16,16,8,4,2,1]:
  dirs=[(s,0),(-s,0),(0,s),(0,-s)]; ws=[]
  for dx,dy in dirs:
   cj=shifted(cost,dx,dy); d=(cj-cost)*(budget+4)
   t=np.clip(cj/lim,0,1); fade=(1-t*t*(3-2*t))**1.6
   w=np.where((cj<=lim)&(cost<=lim)&(d>.001),np.minimum(s/np.maximum(d,.001),4)**3*fade,0)
   if equal:w=np.where((abs(d)<=.001)&(cost<.5/(budget+4)),1.,w)
   ws.append(w)
  total=sum(ws); out=a.copy(); Ti=.35*a/cap
  for (dx,dy),w in zip(dirs,ws):
   aj=shifted(a,dx,dy); capj=shifted(cap,dx,dy); Tj=.35*aj/np.maximum(capj,1e-9)
   capIJ=2*cap*capj/np.maximum(cap+capj,1e-9)
   give=.5*w/np.maximum(total,1e-9)*np.minimum(np.maximum(Ti-Tj,0)*capIJ,.35*a)
   out-=give;out+=shifted(give,-dx,-dy)
  a=out
 profile=[float(a[(r>=k-.5)&(r<k+.5)].mean()) for k in range(40)]
 return a,dict(profile=profile,massRelative=float(a.sum()/mass0),annulus=float(a[(r>=23.5)&(r<25)].mean()),halo=float(a[(r>=25)&(r<27)].mean()))
base,br=evolve(False);cand,cr=evolve(True)
np.savez('temp/outline/oracle.npz',initial=pig,baseline=base,candidate=cand,cost=cost)
print(json.dumps(dict(baseline=br,candidate=cr),indent=2))
