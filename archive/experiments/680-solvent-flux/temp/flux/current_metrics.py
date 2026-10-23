import json,numpy as np
from pathlib import Path
from PIL import Image,ImageFilter
out=Path('temp/flux/current-base-capture');rows=[]
for case in ['spiral','blob']:
 path=Path('temp/flux/current-base-capture');r=next(x for x in json.load(open(path/'report.json')) if x['name']==case+'-flux');f=next(x for x in r['fields'] if x['label']=='pre-P');p0=np.fromfile(path/(case+'-flux-pre-P.rgba'),np.uint8).reshape(f['h'],f['w'],4)[...,2];source=p0>1
 distance=np.zeros(source.shape,np.uint8);d=Image.fromarray(source.astype(np.uint8)*255)
 for k in range(1,49):
  previous=np.array(d)>0;d=d.filter(ImageFilter.MaxFilter(3));now=np.array(d)>0;distance[now&~previous]=k
 for gain in [0,.05,.1]:
  p=np.load(out/(case+'-capillary-'+str(gain)+'.npz'))['P'][...,2];halo=p[~source];outer=(p>8)&~source;dist=distance[outer]
  rows.append(dict(case=case,lambdaCapillary=gain,corePeak=int(p[source].max()),coreMean=float(p[source].mean()),haloPeak=int(halo.max()),haloMeanNonzero=float(halo[halo>0].mean()) if np.any(halo>0) else 0,visibleOutsidePixels=int(outer.sum()),frontChebyshevPx=int(dist.max()) if len(dist) else 0,frontP95Px=float(np.percentile(dist,95)) if len(dist) else 0,massOutside8Plus=float(p[outer].sum()/p.sum())))
json.dump(rows,open(out/'capillary-geometry.json','w'),indent=2)
print(json.dumps(rows,indent=2))
