import numpy as np,json,pathlib
rng=np.random.default_rng(74);N=100000
q=rng.integers(0,256,(N,5,8));f=rng.random((N,4))*.15;room=255-q[:,0];incoming=q[:,1:]*f[:,:,None];total=incoming.sum(1);ratios=np.divide(room,total,out=np.full_like(total,np.inf,dtype=float),where=total>0);lam=np.minimum(1,ratios.min(1));assert np.all(incoming.sum(1)*lam[:,None]<=room+1e-12)
# Integer quarter room floor, independent channels but SAME alpha/pigment when inputpaired.
A=rng.integers(0,256,(N,8));dest=rng.integers(0,256,(N,4,8));raw=rng.random((N,4));raw*=.93/np.maximum(1,raw.sum(1))[:,None];flux=np.minimum(np.floor(A[:,None,:]*raw[:,:,None]),(255-dest)//4).astype(int);stay=A-flux.sum(1);assert (stay>=0).all();assert (flux>=0).all()
print(json.dumps({'cases':N,'floatAll8RecipientBoundPASS':True,'integerIndependentChannelOutgoingPositivePASS':True,'fractionEdgesWithAnyMovingCode':float((flux.sum(2)>0).mean()),'limitations':'Recipient incoming <=room follows eachface room//4. Exact common ratios not retained after byte rounding. No cone premise. Existing P.B==C.A must use SAME allocation and capacities to preserve pairing.'},indent=2))
