import json,numpy as np,hashlib
from pathlib import Path
n=Path(__file__).resolve().parent.parent;import sys;p=n/sys.argv[1];r=json.load(open(p/'report.json'));out={'complete':r['complete'],'errors':r['errors'],'sourceCommit':r['sourceCommit'],'specSHA':r['experimentSha256'],'cases':{}}
for case in r['cases']:
 cid=case['id'];fs={(f['stage'],f['role']):f for f in json.load(open(p/(cid+'-phase-fields.json')))['frames']};c={'error':case['error'],'lost':case['lost'],'first8DrawMaxMs':max(case['brushUnitBudget']),'pngShaExact':hashlib.sha256((p/(cid+'.png')).read_bytes()).hexdigest()==case['pngSha256']};ar={}
 for role in ['pigment','color']:
  a=np.fromfile(p/fs['after-fine-before-brush',role]['file'],np.uint8).reshape(-1,4).astype(np.int64);b=np.fromfile(p/fs['after-brush-stable',role]['file'],np.uint8).reshape(-1,4).astype(np.int64);ar[role]=(a,b);c[role]={'netCodesRGBA':(b-a).sum(0).tolist(),'changedPixels':int((a!=b).any(1).sum()),'absoluteCodesRGBA':abs(b-a).sum(0).tolist(),'minAfter':b.min(0).tolist(),'maxAfter':b.max(0).tolist()}
 for k,label in [(0,'before'),(1,'after')]:
  d=ar['color'][k][:,3]-ar['pigment'][k][:,2];c[label+'AlphaResidual']={'pixels':int((d!=0).sum()),'maxAbsCodes':int(abs(d).max()),'sumCodes':int(d.sum())}
 out['cases'][cid]=c
(p/'eight-channel-audit.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
