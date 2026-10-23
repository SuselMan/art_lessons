from pathlib import Path
import json,numpy as np
from PIL import Image,ImageOps,ImageDraw
p=Path('temp/wc-runs/search-round15');tests=json.loads((p/'control-inputs.json').read_text())['cases']; canvas=Image.new('RGB',(1200,960),'white');draw=ImageDraw.Draw(canvas);stats=[];row=0
for label in ['short','long']:
 for t in tests:
  names=['stack-excess-only-soft','excess-film-dose-control-'+label,'excess-contact-films-'+label]
  images=[Image.open(Path('docs/reference/strokes')/t['reference'])]+[Image.open(p/n/(t['id']+'.png')).crop(t['box']) for n in names]
  for j,im in enumerate(images):
   fit=ImageOps.contain(im.convert('RGB'),(285,210));canvas.paste(fit,(j*300+(300-fit.width)//2,row*240+25));draw.text((j*300+5,row*240+5),t['id']+' '+(['photo']+names)[j],fill='black')
  d=np.abs(np.asarray(images[2],float)-np.asarray(images[3],float));stats.append(dict(case=t['id'],quantum=label,controlMean=float(d.mean()),max=float(d.max())));row+=1
canvas.save(p/'controls.jpg');(p/'control-differences.json').write_text(json.dumps(stats,indent=2));print(stats)
