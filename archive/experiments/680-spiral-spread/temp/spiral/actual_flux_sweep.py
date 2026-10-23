import json,numpy as np
from pathlib import Path
import os
case=os.environ.get('ACTUAL_CASE','spiral');p=Path('temp/spiral/'+('actual-capture-combined' if case=='spiral' else 'actual-capture-blob'));r=json.load(open(p/'report.json'))[0];fs={x['label']:x for x in r['fields']};out=Path('temp/spiral/actual-solvent');out.mkdir(exist_ok=True)
def read(label):
 f=fs[label];return np.fromfile(p/(case+'-baseline-'+label+'.rgba'),np.uint8).reshape(f['h'],f['w'],4)/255
V=read('prefront-V')[...,3]*4;sv=read('source0-solventLoad')[...,3]*4;base=read('source0-solventBase')[...,3]*4;stroke=read('source0-strokeSolvent')[...,3]*4;P=read('prefront-P');coverage=read('prefront-coverage')
assert fs['prefront-V']['world']==fs['prefront-P']['world']==fs['source0-solventBase']['world']
assert np.array_equal(V,sv),'source/canonicalV differs; mapping must be explicit'
assert np.all(V>=base),'negative extra head'
coarse=lambda a:a.reshape(150,4,170,4,*a.shape[2:]).mean((1,3))
V=coarse(V);base=coarse(base);P=coarse(P);coverage=coarse(coverage);wet=(V>.015)&(coverage[...,3]>.001);source=P[...,2]>1/255;results=[]
for scheme in ['local','s4','s8','s16','zero-extra']:
 for closure in ['strength-concentration']:
  v=base.copy() if scheme=='zero-extra' else V.copy();state=P.copy();uniform=v.copy();mass0=state.sum((0,1));v0=v.sum();schedule={'local':[1]*10,'s4':[4,2,1]*2,'s8':[8,4,2,1]*2,'s16':[16,8,4,2,1]*2,'zero-extra':[16,8,4,2,1]*2}[scheme]
  for stride in schedule:
   for axis in [0,1]:
    a=[slice(None),slice(None)];b=a.copy();a[axis]=slice(0,-stride);b[axis]=slice(stride,None);a=tuple(a);b=tuple(b);edge=wet[a]&wet[b]
    for k in range(1,stride):
     sl=[slice(None),slice(None)];sl[axis]=slice(k,v.shape[axis]-stride+k);edge&=wet[tuple(sl)]
    mobility=np.ones_like(v) if closure=='constant' else 1/(1+3*(P[...,3] if closure=='legacy-alpha' else state[...,2]/np.maximum(v,.015)))
    flux=.2*((v-base)[a]-(v-base)[b])*edge*np.minimum(mobility[a],mobility[b]);outgoing=np.zeros_like(v);outgoing[a]+=np.maximum(flux,0);outgoing[b]+=np.maximum(-flux,0);scale=np.minimum(1,.45*v/np.maximum(outgoing,1e-15));flux*=np.where(flux>=0,scale[a],scale[b])
    def advance(s):
     c=s/np.maximum(v[...,None],1e-15);q=flux[...,None]*np.where(flux[...,None]>=0,c[a],c[b]);new=s.copy();new[a]-=q;new[b]+=q;return new
    state=advance(state);uniform=advance(uniform[...,None])[...,0];v[a]-=flux;v[b]+=flux
  result=dict(scheme=scheme,closure=closure,steps=len(schedule)*2,initialPmass=mass0.tolist(),masserror=(state.sum((0,1))-mass0).tolist(),watererror=float(v.sum()-v0),uniformerror=float(np.max(np.abs(uniform-v))),outside_strength_fraction=float(state[...,2][~source].sum()/mass0[2]),minimum=float(state.min()),maximum=float(state.max()),head_initial=float((V-base).sum()),exact_noop=bool(np.array_equal(state,P)),negative_final_head=int((v<base-1e-12).sum()))
  results.append(result);np.savez(out/(case+'-actual-'+scheme+'-'+closure+'.npz'),V=v,P=state,source=source)
json.dump(dict(case=r['case'],GL=r['gl'],lost=r['lost'],sourceCanonicalVExact=True,volume=float(V.sum()),base=float(base.sum()),extra=float((V-base).sum()),results=results),open(out/(case+'-actual-flux-sweep.json'),'w'),indent=2)
for q in results:print(q['scheme'],q['closure'],'outside',q['outside_strength_fraction'],'mass',max(abs(x)for x in q['masserror']),'min',q['minimum'],'headneg',q['negative_final_head'])
