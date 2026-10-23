from pathlib import Path
import json,shutil,hashlib,os
import numpy as np
from PIL import Image
r=Path('temp/wc-runs/overnight-next'); dest=r/'public48'; tmp=r/'public48-staging';assert not dest.exists() and not tmp.exists();tmp.mkdir();ids=['s6-n6','s9-n3','s8-n1','s7-n3'];source=r/'inputs.json';full=json.loads(source.read_text());data={**full,'cases':[next(c for c in full['cases'] if c['id']==i) for i in ids]};(tmp/'inputs.json').write_text(json.dumps(data,indent=2));shutil.copyfile(source,tmp/'original-full-inputs.json');proof=[];variants=[];arrays={}
for original in [r/'calibrated-systematic251-five',r/'calibrated-strength-strong80-v2']:
 report=original/'report.json'; d=json.loads(report.read_text());v=d['variant'];variants.append(v);assert d['base']==full['base'] and d['complete'] and not d.get('errors');folder=tmp/v;folder.mkdir();shutil.copyfile(report,folder/'report.json')
 for i in ids:
  row=next(c for c in d['cases'] if c['id']==i);png=original/(i+'.png');sha=hashlib.sha256(png.read_bytes()).hexdigest();assert sha==row['pngSha256'] and not row.get('lost') and not row.get('error');shutil.copyfile(png,folder/png.name);arrays[v,i]=np.array(Image.open(png).convert('RGB')).astype(np.int16);proof.append({'case':i,'variant':v,'report':str(report),'reportSHA256':hashlib.sha256(report.read_bytes()).hexdigest(),'PNGsha256':sha})
stats=[]
for i in ids:
 a,b=arrays[variants[0],i],arrays[variants[1],i];assert a.shape==b.shape;delta=np.abs(a-b);stats.append({'case':i,'meanAbsoluteRGB':float(delta.mean()),'maxAbsoluteRGB':int(delta.max()),'changedPixels':int(np.any(delta>0,axis=2).sum()),'totalPixels':int(a.shape[0]*a.shape[1])})
(tmp/'compare-stats.json').write_text(json.dumps(stats,indent=2));(tmp/'config.json').write_text(json.dumps({'baseline':variants[0],'description':'Более сильный перенос краски: зигзаг, круговой мазок и два контрольных. Фото — ориентир; можно выбрать «не могу определиться».','comparisons':[{'case':i,'candidate':variants[1]} for i in ids]},ensure_ascii=False,indent=2));(tmp/'staging-proof.json').write_text(json.dumps({'source':full['base'],'cases':4,'originalFullInputsSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'copies':proof,'publication':'NOT published; root review required'},indent=2));os.rename(tmp,dest);print(json.dumps(stats,indent=2))
