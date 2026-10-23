import json
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
root=Path('docs/reference/strokes');a=json.loads((root/'archive.json').read_text());out=Path('temp/wc-runs/gallery-0a78ab53')
for s in a['sheets']:
 sts=[st for st in s['strokes'] if '0a78ab53' in st.get('app',{})]
 if not sts: continue
 sheet=Image.new('RGB',(1080,len(sts)*180),'white');d=ImageDraw.Draw(sheet)
 for row,st in enumerate(sts):
  frames=[st.get('dry'),st['app'].get('0515e56a'),st['app']['0a78ab53']]
  for col,f in enumerate(frames):
   if not f:continue
   im=ImageOps.contain(Image.open(root/f['src']).convert('RGB'),(354,150))
   sheet.paste(im,(col*360+(360-im.width)//2,row*180+25+(150-im.height)//2))
   d.text((col*360+6,row*180+5),f"{s['id']}/{st['n']} "+['photo','before','after'][col],fill='black')
 sheet.save(out/f"sheet-{s['id']}.jpg",quality=92)
