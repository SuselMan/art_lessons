import numpy as np,json,pathlib,math
r=pathlib.Path('temp/wc-runs/overnight-next/nib-wake-audit');rng=np.random.default_rng(680);N=200000;k=np.exp(rng.uniform(0,np.log(12),N));a=rng.uniform(-np.pi,np.pi,N);q=rng.random(N);phi=rng.uniform(-np.pi,np.pi,N);u=np.cos(a);v=np.sin(a);x=np.sqrt(q)*np.cos(phi);y=np.sqrt(q)*np.sin(phi);t=1-q;wx=u*t*(t-4*y*y)+4*k*v*x*y*t;wy=4*u*x*y*t/k+v*t*(t-4*x*x);D=np.maximum(1,np.minimum(k,abs(u)+k*abs(v)));norm=np.hypot(wx,wy)/D;assert max(norm)<=1+1e-12
cap=json.loads(pathlib.Path('temp/wc-runs/overnight-next/full-raw-source-v2-capture/raw-prefix-capture-with-contact-ends.json').read_text());ratios=[]
for d in cap['travel']:
 L=math.hypot(d['dx'],d['dy']);ux=d['dx']/L*math.cos(d['angle'])+d['dy']/L*math.sin(d['angle']);uy=-d['dx']/L*math.sin(d['angle'])+d['dy']/L*math.cos(d['angle']);k=d['aspect'];D=max(1,min(k,abs(ux)+k*abs(uy)));ratios.append(D/k)
(r/'directional-bound-properties.json').write_text(json.dumps(dict(samples=N,maxNorm=float(max(norm)),actualTravel=len(ratios),DoverKpercentiles=np.percentile(ratios,[0,10,50,90,100]).tolist(),actualMeanDoverK=float(np.mean(ratios))),indent=2))
