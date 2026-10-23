from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import json
p=Path('temp/wc-runs/search-round16');tests=json.loads((p/'inputs.json').read_text())['cases'];config=json.loads((p/'publish-config.json').read_text());canvas=Image.new('RGB',(1200,320*len(config['comparisons'])),'white');draw=ImageDraw.Draw(canvas)
for i,c in enumerate(config['comparisons']):
 t=next(t for t in tests if t['id']==c['case']);imgs=[Image.open(Path('docs/reference/strokes')/t['reference']),Image.open(p/c['baseline']/(t['id']+'.png')).crop(t['box']),Image.open(p/c['candidate']/(t['id']+'.png')).crop(t['box'])]
 for j,im in enumerate(imgs):
  fit=ImageOps.contain(im.convert('RGB'),(380,280));canvas.paste(fit,(j*400+(400-fit.width)//2,i*320+30));draw.text((j*400+5,i*320+5),t['id']+' '+(['photo',c['baseline'],c['candidate']][j]),fill='black')
canvas.save(p/'accepted-controls.jpg')
