import hashlib,json,pathlib
p=pathlib.Path(__file__).parent;qc=[]
for f in (p/'candidates').glob('*.json'):
 d=json.load(open(f));r=json.load(open(p/d['id']/'report.json'));assert r['complete'] and not r['errors'];assert r['experimentSha256']==hashlib.sha256(f.read_bytes()).hexdigest()
 for row in r['cases']:
  assert not row['lost'] and not row['error'] and row['draws']>0
  assert row['pngSha256']==hashlib.sha256((p/d['id']/(row['id']+'.png')).read_bytes()).hexdigest()
  for i,x in enumerate(d['runtimePatches']):assert (row['customReplacements'][i]>0 if x['kind']=='shader-exact' else r['modulePatchCounts'][i]>0)
 qc.append({'variant':d['id'],'cases':len(r['cases']),'valid':True})
(p/'qc-complete.json').write_text(json.dumps(qc,indent=2));print(qc)
