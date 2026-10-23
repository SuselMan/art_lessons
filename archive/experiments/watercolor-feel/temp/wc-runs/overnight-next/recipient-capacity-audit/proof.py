import numpy as np,json
rng=np.random.default_rng(26);n=100000
P=rng.random((n,5));f=rng.random((n,4));f=f/(np.maximum(f.sum(1),1)[:,None])*.93
# One recipient, four possible donors. Incoming fractions each originate separately bounded donor CFL.
incoming=P[:,1:]*f;room=1-P[:,0];lam=np.minimum(1,room/np.maximum(incoming.sum(1),1e-300));normalized=incoming*lam[:,None];quarter=np.minimum(incoming,room[:,None]/4)
assert np.all(normalized.sum(1)<=room+1e-15);assert np.all(normalized>=0);assert np.all(normalized<=incoming+1e-15)
# Simultaneous global periodic1D update, common edge flux preserves arbitrary paired cone.
def run(limiter):
 x=np.arange(256);p=.85*np.exp(-((x-110)/10)**2);d=p*.7;start=p.sum();stats=[]
 for k in range(50):
  raw=.6*p;dest=np.roll(p,-1);room=1-dest
  flux=np.minimum(raw,room/(4)) if limiter=='quarter' else np.minimum(raw,room)
  frac=np.divide(flux,p,out=np.zeros_like(p),where=p>0);fd=d*frac
  p=p-flux+np.roll(flux,1);d=d-fd+np.roll(fd,1)
  assert np.all((p>=-1e-15)&(p<=1+1e-15));assert np.all((d>=-1e-15)&(d<=p+1e-15))
 mu=(p*x).sum()/p.sum();return {'massError':float(p.sum()-start),'mean':float(mu),'variance':float((p*(x-mu)**2).sum()/p.sum()),'peak':float(p.max())}
print(json.dumps({'randomCases':n,'maxCapacityExcess':float((normalized.sum(1)-room).max()),'meanIncomingNormalized':float(normalized.sum(1).mean()),'meanIncomingQuarter':float(quarter.sum(1).mean()),'toy':{k:run(k) for k in ['quarter','recipient']},'warning':'Float proof; integerRGBA8 rounds and texture endpoint matching still require GPU verification.'},indent=2))
