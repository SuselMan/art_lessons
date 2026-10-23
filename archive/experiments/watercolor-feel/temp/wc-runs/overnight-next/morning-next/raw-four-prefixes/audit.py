from pathlib import Path
import json,base64,hashlib,numpy as np
p=Path(__file__).parent;out=[]
for cid in ['s6-n6','s6-n5','s9-n1']:
 d=p/(cid+'-capture');r=json.load(open(d/'report.json'));assert r['complete'] and not r['errors'];assert r['experimentSha256']==hashlib.sha256((p/(cid+'-spec.json')).read_bytes()).hexdigest();assert r['sourceCommit']=='7ca4cf5d4960d8181a33b48cad92e9e82e6c8b55';captures=[]
 for c in r['cases']:
  assert not c['lost'] and c['error']==0;assert all(c['programDraws'][k]==0 for k in ['brush','diffuse','fieldHigh']);assert max(x['elapsedMs']for x in c['rawProof']['sourceDrawTimings'])<1000;assert c['rawProof']['baseZero'] and c['rawProof']['finishSkipped'];a=json.load(open(d/(c['id']+'-capture.json')));seq=a['prefixes'];assert len(seq)==(4 if c['id'].endswith('groups4')else 1)
  for role in ['P','C']:
   prev=None
   for pref in seq:
    v=np.frombuffer(base64.b64decode(pref[role]),np.uint8).astype(int)
    if prev is not None:assert (v>=prev).all()
    prev=v
  captures.append(a)
 rows={}
 for role in ['P','C','coverage']:
  a=base64.b64decode(captures[0]['prefixes'][-1][role]);b=base64.b64decode(captures[1]['prefixes'][-1][role]);aa=np.frombuffer(a,np.uint8).astype(int);bb=np.frombuffer(b,np.uint8).astype(int);rows[role]={'byteEqual':a==b,'changedBytes':int((aa!=bb).sum()),'maxCode':int(abs(aa-bb).max()),'sumsGrouped':aa.reshape(-1,4).sum(0).tolist(),'sumsOneshot':bb.reshape(-1,4).sum(0).tolist()}
  if role in ['P','C']:assert a==b
 out.append({'id':cid,'source':rows,'contactTapeEqual':captures[0]['contacts']==captures[1]['contacts'],'travelTapeEqual':captures[0]['travel']==captures[1]['travel'],'groupTimings':r['cases'][0]['rawProof']['groupTimings'],'sourceMonotone':True,'CPUcoverageConvention':'Use fixed oneshot coverage for all CPU models; partition differences explicitly not engine equivalence'})
(p/'final-qc.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
