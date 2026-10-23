import json,numpy as np
from PIL import Image,ImageDraw
from pathlib import Path
N=Path('temp/wc-runs/overnight-next'); d=N/'general-int-pad4-calibrated-clock-five'; out=N/'morning-next/rings-seven-audit'; meta=json.loads((d/'s7-n3-phase-fields.json').read_text()); panels=[];stats={}
for stage in ['after-fine-before-brush','after-brush-stable']:
 fs={f['role']:f for f in meta['frames'] if f['stage']==stage}; vals={}
 for role,f in fs.items():
  a=np.fromfile(d/f['file'],np.uint8).reshape(f['height'],f['width'],4); m=f['mapping']; x0=946-m['x0'];x1=1314-m['x0'];y0=f['height']-(774-m['y0']);y1=f['height']-(574-m['y0']);vals[role]=a[y0:y1,x0:x1][::-1].astype(float)
 p=vals['pigment'];c=vals['color']; ratio=np.divide(c[:,:,1],p[:,:,2],out=np.zeros(p.shape[:2]),where=p[:,:,2]>0); imgs=[p[:,:,2]/255,ratio]
 row=Image.new('RGB',(736,230),'white');draw=ImageDraw.Draw(row)
 for j,v in enumerate(imgs):row.paste(Image.fromarray(np.uint8(np.clip(v,0,1)*255)).convert('RGB'),(368*j,30))
 draw.text((5,5),stage+' P.B / C.G/P.B',fill='black');panels.append(row);stats[stage]={'PB':float(p[:,:,2].sum()),'CG':float(c[:,:,1].sum())};np.save(out/(stage+'.npy'),np.concatenate([p,c],axis=2))
canvas=Image.new('RGB',(736,460),'white');[canvas.paste(im,(0,i*230)) for i,im in enumerate(panels)];canvas.save(out/'physical44-before-after-brush.png');(out/'stage-stats.json').write_text(json.dumps(stats,indent=2))
