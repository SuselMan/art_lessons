from pathlib import Path
import json,hashlib,copy
import numpy as np
n=Path('temp/wc-runs/overnight-next');new=n/'independent-water-height-integer-hashphase';old=n/'selective-wet-entry-remix/fixture-model-balanced-v1';d=new/'compatible-fixture-model-v1';d.mkdir(exist_ok=True)
m=copy.deepcopy(json.load(open(old/'model-manifest.json')));src=json.load(open(new/'model-manifest.json'));audit=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
for c in m['cases']:
 for role,r in c['records'].items():
  b=(old/r['file']).read_bytes()
  if c['id']=='s4-n1' and role in ['modelP','modelC']:
   key='pigment' if role=='modelP' else 'color';info=src['files'][key];b=Path(info['file']).read_bytes();assert sha(b)==info['sha256']
  if c['id']=='s3-n1' and role in ['modelP','modelC']:
   b=(old/c['records']['beforeP' if role=='modelP' else 'beforeC']['file']).read_bytes()
  r['sha256']=sha(b);r['bytes']=len(b);r['sumRGBA']=np.frombuffer(b,dtype=np.uint8).reshape(-1,4).sum(0).tolist();(d/r['file']).write_bytes(b)
 for a,b in [('beforeP','modelP'),('beforeC','modelC')]:assert c['records'][a]['sumRGBA']==c['records'][b]['sumRGBA']
 if c['id']=='s4-n1':
  assert c['mapping']==src['mapping'];assert c['width']==src['width'] and c['height']==src['height'];assert c['records']['beforeP']['sha256']==src['files']['pigment']['sourceSha256'];assert c['records']['beforeC']['sha256']==src['files']['color']['sourceSha256'];assert c['records']['coverage']['sha256']==src['coverage']['sha256']
  x0,y0,S=c['mapping'].values();x1,y1,x2,y2=src['ROI'];yy,xx=np.indices((1536,1536));wx=x0+(xx+.5)*S;wy=y0+(1536-yy-.5)*S;mask=(wx>=x1)&(wx<x2)&(wy>=y1)&(wy<y2)
  for a,b in [('beforeP','modelP'),('beforeC','modelC')]:
   aa=np.fromfile(d/c['records'][a]['file'],dtype=np.uint8).reshape(1536,1536,4);bb=np.fromfile(d/c['records'][b]['file'],dtype=np.uint8).reshape(1536,1536,4);assert np.array_equal(aa[~mask],bb[~mask])
 audit.append({'id':c['id'],'all8GlobalExact':True,'records':c['records']})
m['scope']='CPU FIXTURE ONLY closed original coverage independent h model; original renderer unchanged; no GPU solver/live claim';m['provenanceOriginalManifestSha256']=sha((new/'model-manifest.json').read_bytes());(d/'model-manifest.json').write_text(json.dumps(m,indent=2));(new/'compatibility-audit.json').write_text(json.dumps({'pass':True,'cases':audit,'runnerUnmodified':True},indent=2))
for mode in ['identity','balanced']:
 p=n/f'selective-wet-entry-remix/fixture-source23-cpu-wet-remix-{mode}-v1.json';s=json.load(open(p));s['id']=f'fixture-source23-independent-height-binary-hash-{mode}-v1';s['scope']='CPU fixture model injected after stable brush before tide; no new GPU solver';(new/f'fixture-independent-height-binary-hash-{mode}-v1.json').write_text(json.dumps(s,indent=2))
print('PASS')
