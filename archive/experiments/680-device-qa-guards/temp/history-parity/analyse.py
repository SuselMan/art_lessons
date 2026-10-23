from pathlib import Path
import json,numpy as np
from PIL import Image
b=Path(__file__).parent/'first';r=json.loads((b/'report.json').read_text());result=[]
for case in r['cases']:
 kind=case['kind'];base=np.array(Image.open(b/(kind+'-native.png')).convert('RGBA')).astype(np.int16);row={'kind':kind,'images':{},'source':[]}
 for name in ['defaultRebuild','rebuild','redo','repeat']:
  x=np.array(Image.open(b/(kind+'-'+name+'.png')).convert('RGBA')).astype(np.int16);d=np.abs(base-x);pixel=d.max(axis=2);prem=lambda a:np.concatenate([np.rint(a[:,:,:3].astype(np.float64)*a[:,:,3:]/255),a[:,:,3:]],axis=2);pd=np.abs(prem(base)-prem(x));ys,xs=np.where(pixel>0);row['images'][name]={'pixels':int((pixel>0).sum()),'max':int(d.max()),'alphaMax':int(d[:,:,3].max()),'premultPixels':int((pd.max(axis=2)>0).sum()),'premultMax':int(pd.max()),'pixelsOver8':int((pixel>8).sum()),'premultPixelsOver8':int((pd.max(axis=2)>8).sum()),'bbox':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())] if len(xs) else None,'diffAtAlphaLE8':int(((pixel>0)&(np.maximum(base[:,:,3],x[:,:,3])<=8)).sum())}
 nat=[s for s in case['stages'] if s['phase']=='native'];full=[s for s in case['stages'] if s['phase']=='fullRebuild'];row['stageCounts']={p:sum(s['phase']==p for s in case['stages']) for p in {s['phase'] for s in case['stages']}}
 for i,(n,f) in enumerate(zip(nat,full)):
  fs=[]
  for j,(nt,ft) in enumerate(zip(n['fields'],f['fields'])):
   for k in nt['fields']:
    a=nt['fields'][k];z=ft['fields'].get(k);fs.append({'tile':j,'field':k,'equal':a==z,'nonzeroNative':[x['nonzero'] for x in a],'nonzeroReplay':[x['nonzero'] for x in z] if z else None})
  row['source'].append({'strokeIndex':i,'ctxEqual':n['ctx']==f['ctx'],'nativeCtx':n['ctx'],'fullCtx':f['ctx'],'fields':fs})
 result.append(row)
(b/'analysis.json').write_text(json.dumps(result,indent=2));print(json.dumps([{'kind':x['kind'],'images':x['images'],'stageCounts':x['stageCounts'],'sourceROIExact':all(y['equal'] for z in x['source'] for y in z['fields'])} for x in result]))
