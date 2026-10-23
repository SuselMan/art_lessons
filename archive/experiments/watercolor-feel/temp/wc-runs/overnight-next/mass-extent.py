import pathlib,json,numpy as np
from PIL import Image
p=pathlib.Path(__file__).parent;inp=json.loads((p/'inputs.json').read_text());out=[]
for var,base in [('production-absolute-pigment','production'),('zero-reference05-absolute-pigment','zero-reference-film05')]:
 r=json.loads((p/var/'report.json').read_text())
 for c in r['cases']:
  case=next(t for t in inp['cases'] if t['id']==c['id']);b=case['box'];a=np.array(Image.open(p/var/f"{c['id']}.png").convert('RGB').crop(b)).astype(int);v=np.array(Image.open(p/base/f"{c['id']}.png").convert('RGB').crop(b)).astype(int);delta=np.max(abs(a-v),2);ys,xs=np.where(delta>0);out.append({'variant':var,'case':c['id'],'changedPixels':int((delta>0).sum()),'fractionROI':float((delta>0).mean()),'changedMoreThan4':int((delta>4).sum()),'ROIextent':None if not len(xs) else [int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],'maxChannelDelta':int(delta.max())})
(p/'mass-readout-extent.json').write_text(json.dumps(out,indent=2)+'\n');print(out)
