"""Build a lossless-channel comparison and a labelled visual sheet on HOME."""
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
sheet=sys.argv[1];root=Path(sys.argv[2]);manifest=json.loads((root/'comparison-inventory.json').read_text());row=next(r for r in manifest['sheets'] if str(r['sheet'])==sheet)
a=Image.open(root/f'sheet{sheet}-off.png').convert('RGBA');b=Image.open(root/f'sheet{sheet}-on.png').convert('RGBA')
if a.size!=b.size:raise ValueError('Different export dimensions')
slots=row['slots'];width=max(box[2]-box[0] for box in slots.values());height=max(box[3]-box[1] for box in slots.values());cellw=width+24;cellh=height+40
out=Image.new('RGB',(cellw*2,cellh*len(slots)),'white');draw=ImageDraw.Draw(out);metrics=[]
for i,(n,box) in enumerate(slots.items()):
 x=np.array(a.crop(box));y=np.array(b.crop(box));delta=np.abs(x.astype(np.int16)-y.astype(np.int16));metrics.append({'stroke':n,'changedRGBA':int(np.any(delta,axis=2).sum()),'changedAlpha':int(np.count_nonzero(delta[:,:,3])),'maxChannelDifference':int(delta.max())})
 for col,im in enumerate((a,b)):
  crop=im.crop(box);bg=Image.new('RGBA',crop.size,'white');bg.alpha_composite(crop);out.paste(bg.convert('RGB'),(col*cellw+12,i*cellh+28))
  draw.text((col*cellw+12,i*cellh+8),f'{n} '+('OFF' if col==0 else 'phase + baked ON'),fill='black')
out.save(root/f'sheet{sheet}-pair-atlas.jpg',quality=95)
(root/f'sheet{sheet}-pair-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps({'sheet':sheet,'dimensions':a.size,'slots':len(slots),'metrics':metrics}))
