from pathlib import Path
import hashlib,json,numpy as np,shutil
p=Path('temp/wc-runs/overnight-next/selective-wet-entry-remix');src=p.parent/'wet-context-source23-stages-v3-three-four';dest=p/'fixture-model-balanced-v1';dest.mkdir(exist_ok=False);rows=[]
for cid in ['s3-n1','s4-n1']:
 fs=json.loads((src/(cid+'-phase-fields.json')).read_text())['frames'];frames={f['role']:f for f in fs if f['stage']=='after-brush-stable'};records={};sums={}
 for key,role in [('beforeP','pigment'),('beforeC','color'),('coverage','coverage'),('modelP','pigment'),('modelC','color')]:
  f=frames[role];file=src/f['file'] if key.startswith('before')or key=='coverage' else p/(cid+'-systematic-actualcov-variable-balanced-i12-'+('P'if role=='pigment'else'C')+'.rgba');raw=file.read_bytes();assert len(raw)==f['width']*f['height']*4;sha=hashlib.sha256(raw).hexdigest();
  if key.startswith('before')or key=='coverage':assert sha==f['sha256']
  name=cid+'-'+key+'.rgba';(dest/name).write_bytes(raw);sums[key]=np.frombuffer(raw,np.uint8).reshape(-1,4).sum(0).tolist();records[key]={'file':name,'sha256':sha,'bytes':len(raw),'sumRGBA':sums[key]}
 assert sums['beforeP']==sums['modelP'] and sums['beforeC']==sums['modelC'];f=frames['pigment'];rows.append({'id':cid,'width':f['width'],'height':f['height'],'mapping':f['mapping'],'orientation':'GLbottomup','records':records,'originalStageManifestSha256':hashlib.sha256((src/(cid+'-phase-fields.json')).read_bytes()).hexdigest()})
manifest={'scope':'FIXTURE CPU model injection ONLY. Not implemented GPU solver, not live/replay promotion.','hopSequence':[9,13,16,11,7,15,10,14,12,8,17,6],'fraction':.14,'dynamicGate':True,'wetpath':'all integer intermediate coverage.B samples','phase':'donor worldCDF251 iteration','cases':rows};(dest/'model-manifest.json').write_text(json.dumps(manifest,indent=2));print('PASS all8 sums',len(rows))
