import pathlib,json,numpy as np,hashlib
from PIL import Image
p=pathlib.Path(__file__).parent;cid='s9-prefix4-translated-singleTile';names=['causal-additive-one-shot-r3','causal-fast-zero-r4','causal-fast-interleave-r4'];out=[];prev={}
for name in names:
 meta=json.loads((p/name/f'{cid}-composite-fields.json').read_text());a={}
 for key in ['0_0-u_inkLoad','0_0-u_inkColor','0_0-u_strokeCoverage']:
  m=meta[key];a[key]=np.fromfile(p/name/f'{cid}-{key}.rgba',np.uint8).reshape(m['height'],m['width'],4)
 ink=a['0_0-u_inkLoad'];depth=a['0_0-u_inkColor'];row={'variant':name,'sumsRGBAInkCodes':ink.sum((0,1)).tolist(),'sumsRGBAOpticalCodes':depth.sum((0,1)).tolist(),'positiveA':int((ink[:,:,3]>0).sum()),'alpha255':int((ink[:,:,3]==255).sum())}
 if prev:
  row['fieldDeltaVsOneShot']={k:{'meanCodes':float(abs(v.astype(float)-prev[k]).mean()),'maxCodes':int(abs(v.astype(float)-prev[k]).max()),'changedPixels':int(np.any(v!=prev[k],2).sum())} for k,v in a.items()}
 else:prev=a
 b=Image.open(p/name/f'{cid}.png').convert('RGB').crop([300,300,600,600]);x=np.array(b).astype(float)
 if out: row['PNGDeltaVsOneShot']={'mean':float(abs(x-first).mean()),'max':float(abs(x-first).max())}
 else:first=x
 out.append(row)
(p/'r4-final-fields-comparison.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
