import numpy as np,json,pathlib
rng=np.random.default_rng(70);xi=(np.arange(251)+.5)/251;worst=0
for _ in range(10000):
 q=int(rng.integers(0,256));f=rng.random(4);f*=.9285/max(1,f.sum());prefix=np.cumsum(f);c=np.floor(q*prefix[:,None]+xi[None,:]);flux=np.diff(np.vstack([np.zeros((1,251)),c]),axis=0);err=np.max(abs(flux.mean(1)-q*f));worst=max(worst,float(err));assert err<=1/251+1e-12
# Hash state step137 permutes all251 states; coordinate multiplicationbounded <125000.
assert len(set((137*t)%251 for t in range(251)))==251
pathlib.Path('temp/wc-runs/overnight-next/systematic-integer-flux-audit/finite-phase-proof.json').write_text(json.dumps({'randomFixedFractionDonors':10000,'all251FinitePhaseEdgeMeanBiasBound':1/251,'observedMaxEdgeBias':worst,'hashTick251PermutationPASS':True,'warning':'Unbiased continuous expectation NOTclaimed; actual varyingf across ticks notfixedensemble'},indent=2)+'\n')
