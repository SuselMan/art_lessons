import pathlib,json,numpy as np
r=pathlib.Path('temp/wc-runs/overnight-next/paired-phase-physical22-seven-rich-v2');d=json.loads((r/'s7-n3-phase-fields.json').read_text());fs={(f['stage'],f['role']):f for f in d['frames']}
a=[]
for role in ['pigment','color']:
 f=fs['after-split',role];a.append(np.fromfile(r/f['file'],dtype=np.uint8).reshape(f['height'],f['width'],4).astype(float))
q=np.concatenate(a,axis=2);recipient=np.roll(q,-1,axis=1);raw=.6;ratios=np.divide(np.floor((255-recipient)/4),q*raw,out=np.full_like(q,np.inf),where=q>0);lam=np.minimum(1,ratios.min(2));support=q.sum(2)>0;flux=np.floor(q*raw*lam[...,None]);after=q-flux+np.roll(flux,1,axis=1);assert (after>=0).all() and (after<=255).all();assert np.array_equal(after.sum((0,1)),q.sum((0,1)));assert np.array_equal(after[...,2],after[...,7])
out={'scope':'Measured actual7 AFTER-SPLIT P/C bytes; hypothetical uniform right flux .6 periodicgrid, NOT actual brush flow','activeDonors':int(support.sum()),'positiveLambdaActiveFraction':float((lam[support]>0).mean()),'positiveMovingCodesActiveFraction':float((flux.sum(2)[support]>0).mean()),'lambdaMeanActive':float(lam[support].mean()),'all8IntegerTotalsExact':True,'all8BoundsPASS':True,'pigmentColorAlphaExactPASS':True};pathlib.Path('temp/wc-runs/overnight-next/general-integer-flux-audit/mixed-common-edge-example.json').write_text(json.dumps(out,indent=2)+'\n')
