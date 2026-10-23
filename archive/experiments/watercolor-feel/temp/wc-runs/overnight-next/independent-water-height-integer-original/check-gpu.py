from pathlib import Path
import json,hashlib
n=Path(__file__).resolve().parent.parent;d=Path(__file__).resolve().parent;model=d/'compatible-fixture-model-v1';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();out={}
for mode in ['identity','balanced']:
 f=n/f'fixture-independent-height-{mode}-three-four';r=json.load(open(f/'report.json'));spec=d/f'fixture-independent-height-{mode}-v1.json';assert r['complete'] and not r['errors'];assert r['experimentSha256']==sha(spec);assert r['modelManifestSha256']==sha(model/'model-manifest.json');assert r['sourceCommit']=='7ca4cf5d4960d8181a33b48cad92e9e82e6c8b55';cases=[]
 for c in r['cases']:
  id=c['id'];assert c['error']==0 and not c['lost'];assert sha(f/(id+'.png'))==c['pngSha256'];p=c['injectionProof'];assert p['originalExact'] and p['all8SumsExact'] and p['coverageExact'];assert max((x['ms'] for x in c['brushUnitBudget']),default=0)<=1000
  for role,rec in p['records'].items():assert sha(model/rec['file'])==rec['sha256']
  eq=(f/(id+'.png')).read_bytes()==(n/'wet-context-source23-stages-v3-three-four'/(id+'.png')).read_bytes();assert eq if mode=='identity' or id=='s3-n1' else not eq
  for manifest in [f/(id+'-phase-fields.json'),f/(id+'-composite-fields.json')]:
   if manifest.exists():
    a=json.load(open(manifest));rows=a if isinstance(a,list) else a.get('frames',list(a.values()))
    for row in rows:
     if 'file' in row and 'sha256' in row:assert sha(f/row['file'])==row['sha256']
  cases.append({'id':id,'PNGexactSource23':eq,'changedBytes':p['changedBytes'],'all8Exact':True,'coverageExact':True,'unitMaxMs':max((x['ms'] for x in c['brushUnitBudget']),default=0)})
 out[mode]={'complete':True,'cases':cases,'specSHA':r['experimentSha256']}
(d/'final-gpu-qc.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
