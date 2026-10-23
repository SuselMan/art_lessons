import math,json,random
from pathlib import Path

def layer(k,s,d):
    l,q=k*d,s*d
    if d==0:return 0.,1.
    if s==0:return 0.,math.exp(-l)
    if k==0:return q/(1+q),1/(1+q)
    h=math.sqrt(l*(l+2*q));e=math.exp(-h);z=-math.expm1(-2*h)
    den=(l+q)*z+h*(1+e*e)
    return q*z/den,2*h*e/den

def white(k,s,d,back=1.):
    r,t=layer(k,s,d)
    return r+t*t*back/(1-r*back)

def calibrate(target,s=.2):
    lo,hi=0.,1.
    while white(hi,s,1)>target:hi*=2
    for _ in range(70):
        mid=(lo+hi)/2
        if white(mid,s,1)>target:lo=mid
        else:hi=mid
    return (lo+hi)/2
rows=[]
for target in [.05,.2,.5,.8,.95]:
 k=calibrate(target)
 rows.append({'ordinaryFilmTarget':target,'scatteringSdAtFilm':.2,'calibratedKdAtFilm':k,'reflectanceAtD':[{'d':d,'KM':white(k,.2,d),'Beer':target**d} for d in [0,.1,1,3,10,100]]})
rng=random.Random(7);worst=0
for _ in range(20000):
 k,s,d=[10**rng.uniform(-6,3) for i in range(3)];back=rng.random();r,t=layer(k,s,d);w=white(k,s,d,back)
 assert 0<=r<=1+1e-12 and 0<=t<=1+1e-12 and r+t<=1+1e-12 and 0<=w<=1+1e-12
 worst=max(worst,r+t)
Path(__file__).with_name('examples.json').write_text(json.dumps({'swatches':rows,'randomBoundChecks':20000,'largestRplusT':worst},indent=2)+'\n')
print('20000 passive bound checks passed; 5 film-calibrated swatches')
