import json
from PIL import Image,ImageDraw
from pathlib import Path
r=Path('.');s=next(s for s in json.load(open(r/'docs/reference/strokes/archive.json'))['sheets'] if s['id']=='6')
keys=['photo','baseline','exchange'];ims={k:Image.open(r/f'temp/wc-runs/brush-drag/sheet6-{k}.png').convert('RGB') for k in keys if k!='photo'}
out=Image.new('RGB',(1800,1800),'white');d=ImageDraw.Draw(out)
for i,st in enumerate(s['strokes']):
 for j,k in enumerate(keys):
  im=Image.open(r/'docs/reference/strokes'/st['dry']['src']) if k=='photo' else ims[k].crop(s['board']['slots'][str(st['n'])])
  im.thumbnail((585,155));x=j*600;y=i*180;out.paste(im,(x,y+20));d.text((x,y),f'{st["n"]} {k}',fill='black')
out.save(r/'temp/wc-runs/brush-drag/sheet6-compare.jpg')
