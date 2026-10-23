from pathlib import Path
import json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=Path('temp/wc-runs/overnight-next/selective-wet-entry-remix');rows=[]
for result in sorted(p.glob('*actualcov-h*-results.json')):
 tag=result.stem.removesuffix('-results');entry=next(x for x in json.loads(result.read_text())if x['case']=='s4-n1');a=np.load(p/('s4-n1-'+tag+'-before.npy'))*2/255;b=np.load(p/('s4-n1-'+tag+'-after.npy'))*2/255;x0,y0,x1,y1=entry['cropField'];mapping=entry['fieldMapping'];yy,xx=np.indices(a.shape);wx=mapping['x0']+x0+xx+.5;wy=mapping['y0']+1536-(y0+yy+.5);centre=(wx-1521.2178955)**2+(wy-309.633606)**2<64;cross=(abs(wx-1521.2178955)<50)&(abs(wy-309.633606)<8);paint=a>.005
 stats={}
 for name,mask in [('centre8',centre),('cross100x16',cross),('all-original-pigment',paint)]:stats[name]={'meanBefore':float(a[mask].mean()),'meanAfter':float(b[mask].mean()),'varianceBefore':float(a[mask].var()),'varianceAfter':float(b[mask].var()),'absoluteChangeMean':float(abs(b[mask]-a[mask]).mean())}
 rows.append({'tag':tag,'metrics':stats,'transportCodes':entry['movedPigmentByteCodes'],'3preserved':next(x for x in json.loads(result.read_text())if x['case']=='s3-n1')['changedBytes']==0})
(p/'sweep-summary.json').write_text(json.dumps(rows,indent=2));print([(r['tag'],r['metrics']['centre8']['meanBefore'],r['metrics']['centre8']['meanAfter'],r['metrics']['cross100x16']['varianceAfter'])for r in rows])
fig,ax=plt.subplots(1,3,figsize=(15,5));tag='systematic-actualcov-h16-i12';a=np.load(p/('s4-n1-'+tag+'-before.npy'))*2/255;b=np.load(p/('s4-n1-'+tag+'-after.npy'))*2/255
for t,z,title in zip(ax,[a,b,b-a],['actual postbrush mass2','CPU systematic16px ×12 conservative','delta mass2']):t.imshow(z,origin='lower',cmap='coolwarm' if title.startswith('delta')else'viridis',vmin=-.15 if title.startswith('delta')else 0,vmax=.15 if title.startswith('delta')else 1);t.set_title(title);t.axis('off')
fig.suptitle('Actual coverage.B every intermediate pixel; NOT GPU output or physical diffusion validation');fig.tight_layout();fig.savefig(p/'s4-systematic16-comparison.png',dpi=150)
