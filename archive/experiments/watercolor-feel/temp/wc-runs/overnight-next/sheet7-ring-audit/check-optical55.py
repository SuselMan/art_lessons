import pathlib,json,hashlib
p=pathlib.Path(__file__).parents[1];new=p/'symmetric-soft16-optical-gain55-controls';old=p/'sheet7-symmetric-face-controls';r=json.loads((new/'report.json').read_text());cases=[]
for c in r['cases']:
 cid=c['id'];a=json.loads((old/(cid+'-phase-fields.json')).read_text())['frames'];b=json.loads((new/(cid+'-phase-fields.json')).read_text())['frames'];proof=[]
 for x in b:
  y=next(f for f in a if f['stage']==x['stage'] and f['role']==x['role']);equal=(new/x['file']).read_bytes()==(old/y['file']).read_bytes();proof.append({'stage':x['stage'],'role':x['role'],'byteExact':equal,'sha256':x['sha256']});assert equal
 assert not c['error'] and not c['lost'];assert hashlib.sha256((new/(cid+'.png')).read_bytes()).hexdigest()==c['pngSha256']
 cases.append({'id':cid,'phaseProof':proof,'GL':c['error'],'lost':c['lost'],'first8MaxMs':max(c['brushUnitBudget']),'pngSha256':c['pngSha256']})
assert r['complete'] and not r['errors'];out={'status':'PASS','specSha256':r['experimentSha256'],'cases':cases,'scope':'All4phase P/C matched symmetric parent. Final composite coverage/material sampler invariance NOT_MEASURED.'};(new/'optical-only-qc.json').write_text(json.dumps(out,indent=2));print(out)
