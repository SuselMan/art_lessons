from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageOps
p=Path('temp/wc-runs/search-round14')
tests=json.loads((p/'inputs.json').read_text())['cases']
variants=['stack-excess-only-soft','excess-mixed-bundle35','excess-mixed-phase35']
canvas=Image.new('RGB',(300*(len(variants)+1),240*len(tests)),'white');draw=ImageDraw.Draw(canvas)
stats=[]
for i,t in enumerate(tests):
 images=[Image.open(Path('docs/reference/strokes')/t['reference'])]+[Image.open(p/v/(t['id']+'.png')).crop(t['box']) for v in variants]
 for j,img in enumerate(images):
  fit=ImageOps.contain(img.convert('RGB'),(285,210));canvas.paste(fit,(300*j+(300-fit.width)//2,240*i+25));draw.text((300*j+5,240*i+5),t['id']+' '+(['photo']+variants)[j],fill='black')
 for j,v in enumerate(variants[1:],start=2):
  delta=np.abs(np.asarray(images[1].convert('RGB'),dtype=float)-np.asarray(images[j].convert('RGB'),dtype=float))
  stats.append({'case':t['id'],'variant':v,'mean':float(delta.mean()),'max':float(delta.max())})
canvas.save(p/'mixed.jpg');(p/'mixed-differences.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))
