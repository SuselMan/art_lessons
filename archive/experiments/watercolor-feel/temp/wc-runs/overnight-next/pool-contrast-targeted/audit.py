from pathlib import Path
import json,hashlib,numpy as np
n=Path(__file__).resolve().parent.parent;d=Path(__file__).resolve().parent;parent=n/'saturating-beer-softshoulder16-four';base=json.load(open(parent/'report.json'));out={}
for label,folder,specname in [('055','pool-amplitude055-primary-two','amplitude0p55.json'),('035','pool-amplitude035-primary-two','amplitude0p35.json')]:
 f=n/folder;r=json.load(open(f/'report.json'));spec=json.load(open(d/specname));assert r['complete']and not r['errors'];assert r['experimentSha256']==hashlib.sha256((d/specname).read_bytes()).hexdigest();rows=[]
 for c in r['cases']:
  id=c['id'];assert c['error']==0 and not c['lost'];assert hashlib.sha256((f/(id+'.png')).read_bytes()).hexdigest()==c['pngSha256'];assert max(c['brushUnitBudget'],default=0)<1000
  for i,p in enumerate(spec['runtimePatches']):assert c['customReplacements'][i]>0 if p['kind']=='shader-exact'else r['modulePatchCounts'][i]>0
  fa=json.load(open(f/(id+'-composite-fields.json')));fb=json.load(open(parent/(id+'-composite-fields.json')));inv={}
  for role in ['u_inkLoad','u_inkColor','u_strokeCoverage']:
   keys=[k for k in fa if k.endswith('-'+role)];assert set(keys)=={k for k in fb if k.endswith('-'+role)};aa=sum((np.fromfile(f/(id+'-'+k+'.rgba'),np.uint8).reshape(-1,4).sum(0).astype(np.int64)for k in keys),np.zeros(4,dtype=np.int64));bb=sum((np.fromfile(parent/(id+'-'+k+'.rgba'),np.uint8).reshape(-1,4).sum(0).astype(np.int64)for k in keys),np.zeros(4,dtype=np.int64));inv[role]={'candidateEncodedSums':aa.tolist(),'parentEncodedSums':bb.tolist(),'relativeDelta':np.divide(aa-bb,bb,out=np.zeros(4,dtype=float),where=bb!=0).tolist(),'samplerCount':len(keys)}
  rows.append({'id':id,'inventory':inv,'unitMaxMs':max(c['brushUnitBudget'],default=0)})
 out[label]={'report':str(f/'report.json'),'specSHA':r['experimentSha256'],'rows':rows}
out['scope']='Finite FINAL composite sampler inventories in encoded units; no measured initial source dose or mass-matched claim. Source coefficient intentionally changes distribution and potentially inventory.';(d/'final-qc-inventory.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
