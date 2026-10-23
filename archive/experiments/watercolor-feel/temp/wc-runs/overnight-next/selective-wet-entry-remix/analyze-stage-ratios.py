from pathlib import Path
import hashlib,json,numpy as np
r=Path('temp/wc-runs/overnight-next');p=r/'selective-wet-entry-remix';folder=r/'wet-context-source23-stages-v2-three-four';out=[]
for cid in ['s3-n1','s4-n1']:
 film=json.loads((folder/(cid+'-current-film.json')).read_text());ph=json.loads((folder/(cid+'-phase-fields.json')).read_text());land=film['operationContexts'][0]['landedWetArg'];rows=[]
 for f in film['frames']+ph['frames']:
  raw=(folder/f['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==f['sha256'];a=np.frombuffer(raw,np.uint8).reshape(f['height'],f['width'],4).astype(float)/255
  if f['role']!='pigment':continue
  mask=a[:,:,2]>.005
  if not mask.any():rows.append({'stage':f['stage'],'samplesPigmentB':0,'origin':f.get('origin'),'status':'empty pigmented tile'});continue
  ratio=a[:,:,1][mask]/np.maximum(a[:,:,3][mask],1e-9);gate=np.maximum(np.clip(ratio,0,1)-land,0)
  rows.append({'stage':f['stage'],'samplesPigmentB':int(mask.sum()),'meanAphysical2':float(a[:,:,3][mask].mean()*2),'meanGphysical2':float(a[:,:,1][mask].mean()*2),'GoverAquantiles':np.quantile(ratio,[0,.1,.5,.9,1]).tolist(),'gateMean':float(gate.mean()),'gatePositiveFraction':float((gate>1e-6).mean()),'gateMax':float(gate.max()),'origin':f.get('origin'),'mapping':f.get('mapping')})
 out.append({'case':cid,'context':film['operationContexts'],'stages':rows})
(p/'trusted-stage-ratios.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
