import pathlib,json,numpy as np,hashlib
root=pathlib.Path('temp/wc-runs/overnight-next');result=[]
def stats(P,C):
 return {'pixels':int(P.shape[0]),'physicalRGBoverA':(P[:,:3]>P[:,3,None]).sum(0).tolist(),'depthRGBoverPigmentB':(C[:,:3]>P[:,2,None]).sum(0).tolist(),'colorAlphaNotPigmentB':int((C[:,3]!=P[:,2]).sum()),'maxAbsAlphaDifference':int(abs(C[:,3].astype(int)-P[:,2].astype(int)).max())}
for folder in ['paired-phase-physical22-nine','paired-phase-substeps-nine']:
 path=root/folder/'s9-n3-phase-fields.json';meta=json.loads(path.read_text());fs={(f['stage'],f['role']):f for f in meta['frames']}
 for stage in ['after-fine-before-brush','after-brush-stable']:
  p,c=[fs[(stage,k)] for k in ['pigment','color']];assert p['mapping']==c['mapping'] and p['width']==c['width'] and p['height']==c['height'];arrays=[]
  for f in [p,c]:
   b=(path.parent/f['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==f['sha256'];arrays.append(np.frombuffer(b,dtype=np.uint8).reshape(-1,4))
  result.append({'artifact':folder,'stage':stage,**stats(*arrays)})
for folder in ['production-physical22-brush-resolution-substeps-bound9-budget4096','production-max-paired-headroom2-microcoupled-curvature10']:
 path=root/folder/'s7-n3-composite-fields.json'
 if not path.exists():continue
 meta=json.loads(path.read_text())
 for key,f in meta.items():
  if not key.endswith('-u_inkLoad'):continue
  ck=key.replace('-u_inkLoad','-u_inkColor');assert meta[ck]==f
  P,C=[np.fromfile(path.parent/('s7-n3-'+k+'.rgba'),dtype=np.uint8).reshape(-1,4) for k in [key,ck]]
  result.append({'artifact':folder,'tile':key,**stats(P,C)})
(root/'integer-paired-allocation/actual-byte-cones.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result[:4],indent=2))
