from PIL import Image,ImageOps,ImageDraw
import json,sys
from pathlib import Path
s=next(s for s in json.load(open('docs/reference/strokes/archive.json'))['sheets'] if s['id']=='9');d=Path('temp/wc-runs/sheet9');names=sys.argv[1:];out=Image.new('RGB',((len(names)+1)*350,6*280),'white');draw=ImageDraw.Draw(out)
for col,name in enumerate(['photo']+names):
 im=Image.open(d/(name+'.png')).convert('RGB') if name!='photo' else None
 for row,(n,box) in enumerate(s['board']['slots'].items()):
  crop=im.crop(box) if im else Image.open(Path('docs/reference/strokes')/next(st for st in s['strokes'] if str(st['n'])==n)['dry']['src'])
  p=ImageOps.contain(crop,(340,250));out.paste(p,(col*350+(350-p.width)//2,row*280+25));draw.text((col*350+5,row*280+5),name+'/'+n,fill='black')
out.save(d/'compare.jpg')
