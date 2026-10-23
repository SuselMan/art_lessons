import pathlib,json,hashlib,sys
n=pathlib.Path('temp/wc-runs/overnight-next');p=n/sys.argv[1];d=json.loads((p/'report.json').read_text());assert d['complete'] and not d['errors'];out={'complete':True,'errors':[],'sourceCommit':d['sourceCommit'],'experimentSha256':d['experimentSha256'],'cases':[]}
for c in d['cases']:
 assert c['error']==0 and not c['lost'];assert c['wakeAudit']['samples']>0 and c['wakeAudit']['maxNorm']<=1+1e-6
 f=json.loads((p/(c['id']+'-phase-fields.json')).read_text())['frames'];assert len(f)==4
 frames={}
 for x in f:
  raw=(p/x['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==x['sha256'];sums=[sum(raw[k::4])for k in range(4)];assert sums==x['sumRGBA'];frames[(x['stage'],x['role'])]=(raw,sums)
 net={r:[b-a for a,b in zip(frames[('after-fine-before-brush',r)][1],frames[('after-brush-stable',r)][1])]for r in ['pigment','color']};assert all(v==0 for vals in net.values()for v in vals)
 pre={}
 if c['id']in ['s9-n3','s8-n1']:
  for r in ['pigment','color']:
   a=frames[('after-fine-before-brush',r)][0];b=(n/'calibrated-strength-strong80-v2'/(c['id']+'-after-fine-before-brush-'+r+'.rgba')).read_bytes();pre[r]=a==b;assert a==b
 out['cases'].append({'id':c['id'],'all8NetCodes':net,'preBrushExactVs80':pre,'velocityMaxNorm':c['wakeAudit']['maxNorm'],'velocitySamples':c['wakeAudit']['samples'],'unitMaxMs':max(c['brushUnitBudget']),'pngSHAvalid':hashlib.sha256((p/(c['id']+'.png')).read_bytes()).hexdigest()==c['pngSha256'],'contacts':[sum(x['pulses']for x in c['calibratedContactAudit']),len(c['calibratedContactAudit'])]})
(p/'independent-qc.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
