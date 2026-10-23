from pathlib import Path
import json,hashlib
n=Path(__file__).resolve().parent.parent; d=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
a=n/'optics-holdout-parent44-three'; b=n/'optics-holdout-softshoulder16-three'
ra=json.load(open(a/'report.json'));rb=json.load(open(b/'report.json'))
ids=['s6-n5','s9-n1','s9-n5']; out={'cases':[]}
for r,folder,spec in [(ra,a,d/'actual-rendered-parent44.json'),(rb,b,d/'actual-rendered-softshoulder16.json')]:
 assert r['complete'] and not r['errors']; assert r['experimentSha256']==sha(spec)
 assert r['sourceCommit']=='7ca4cf5d4960d8181a33b48cad92e9e82e6c8b55'; assert [x['id'] for x in r['cases']]==ids
 for c in r['cases']:
  assert c['error']==0 and not c['lost'];assert sha(folder/(c['id']+'.png'))==c['pngSha256'];assert max(c['brushUnitBudget'],default=0)<=1000
 assert all(x>0 for i,x in enumerate(r['modulePatchCounts']) if json.load(open(spec))['runtimePatches'][i]['kind']!='shader-exact')
 assert all(all(c['customReplacements'][i]>0 for c in r['cases']) for i,p in enumerate(json.load(open(spec))['runtimePatches']) if p['kind']=='shader-exact')
for id in ids:
 fa=json.load(open(a/(id+'-composite-fields.json')));fb=json.load(open(b/(id+'-composite-fields.json')))
 keys=[k for k in fa if any(k.endswith('-'+s) for s in ['u_inkLoad','u_inkColor','u_strokeCoverage'])]
 assert set(keys)=={k for k in fb if any(k.endswith('-'+s) for s in ['u_inkLoad','u_inkColor','u_strokeCoverage'])}
 rows=[]
 for k in keys:
  pa=a/(id+'-'+k+'.rgba');pb=b/(id+'-'+k+'.rgba'); assert sha(pa)==sha(pb);rows.append({'key':k,'sha256':sha(pa),'bytes':pa.stat().st_size})
 out['cases'].append({'id':id,'physicalSamplersByteExact':True,'samplers':rows})
out['pass']=True;out['sourceShaEqual']=ra['sourceSha256']==rb['sourceSha256'];assert out['sourceShaEqual'];(d/'final-qc.json').write_text(json.dumps(out,indent=2));print(json.dumps({'pass':True,'samplers':[(x['id'],len(x['samplers'])) for x in out['cases']]}))
