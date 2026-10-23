import json,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=Path(__file__).parent;a=json.loads((p/'preview-stage/archive.json').read_text());base=Path('/home/suselman/projects/pencil-agents/680-gallery-clip/docs/reference/strokes');font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
for sheet in a['sheets']:
 if sheet['id'] not in sys.argv[1:]:continue
 rows=[]
 for st in sheet['strokes']:
  new=st.get('app',{}).get('1e49aa99-clip')
  if not new:continue
  row=Image.new('RGB',(900,210),'white');d=ImageDraw.Draw(row)
  for i,(label,frame,isnew) in enumerate([('Фото',st.get('dry') or st['wet'][-1],False),('c1997fee',st['app'].get('c1997fee-review'),False),('1e49aa99-clip',new,True)]):
   d.text((i*300+4,3),f"{sheet['id']} №{st['n']} · {label}",font=font,fill='black')
   if frame:
    im=Image.open((p/'preview-stage' if isnew else base)/frame['src']).convert('RGB');im.thumbnail((290,185));row.paste(im,(i*300+(300-im.width)//2,22+(185-im.height)//2))
  rows.append(row)
 out=Image.new('RGB',(900,210*len(rows)),'white')
 for i,row in enumerate(rows):out.paste(row,(0,210*i))
 out.save(p/f"contact-sheet{sheet['id']}.jpg",quality=88)
