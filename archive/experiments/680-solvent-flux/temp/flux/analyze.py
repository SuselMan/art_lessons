import json,hashlib,numpy as np
from pathlib import Path
from PIL import Image,ImageDraw
p=Path('temp/flux/gpu');rows=json.load(open(p/'report.json'));stats=[]
for r in rows:
 if not r['fields']:continue
 fs={f['label']:f for f in r['fields']}
 def read(l):
  m=fs[l];return np.fromfile(p/(r['name']+'-'+l+'.rgba'),np.uint8).reshape(m['h'],m['w'],4).astype(np.int64)
 before,after=read('pre-P'),read('post-P');vb,va=read('pre-V'),read('post-V');source=before[...,2]>1
 stats.append(dict(name=r['name'],GL=r['gl'],massBefore=before.sum((0,1)).tolist(),massAfter=after.sum((0,1)).tolist(),massError=(after.sum((0,1))-before.sum((0,1))).tolist(),Verror=int(va[...,3].sum()-vb[...,3].sum()),outsidePigment=float(after[...,2][~source].sum()/before[...,2].sum()),initialOutside=float(before[...,2][~source].sum()/before[...,2].sum()),maxP=int(after.max()),minP=int(after.min()),changed=int(np.any(before!=after,2).sum())))
canvas=Image.new('RGB',(1280,1020),'white');d=ImageDraw.Draw(canvas)
for i,shape in enumerate(['spiral','blob']):
 for j,flag in enumerate(['baseline','flux']):
  im=Image.open(p/(shape+'-'+flag+'.png')).convert('RGB');im.thumbnail((640,480));canvas.paste(im,(j*640,i*510+30));d.text((j*640+10,i*510+5),shape+' '+flag,fill='black')
canvas.save('temp/flux/compare.jpg')
direct=Path('temp/flux/direct');hashes={flag:hashlib.sha256((direct/('direct-'+flag+'.png')).read_bytes()).hexdigest() for flag in ['baseline','flux']}
json.dump(dict(stages=stats,directHashes=hashes,directExact=len(set(hashes.values()))==1),open('temp/flux/metrics.json','w'),indent=2)
print(json.dumps(dict(stages=stats,directExact=len(set(hashes.values()))==1),indent=2))
