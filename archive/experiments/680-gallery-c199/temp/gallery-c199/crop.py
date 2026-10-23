import json,hashlib,datetime,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
base=Path(__file__).parent;dest=base/'preview-stage';a=json.loads((base/'archive-source.json').read_text());version='c1997fee-review';reports=[]
selected=set(sys.argv[1:] or [s['id'] for s in a['sheets'] if s.get('board',{}).get('room')])
for sheet in a['sheets']:
 if sheet['id'] not in selected:continue
 raw=base/('sheet'+sheet['id']+'-c1997fee.png');report=json.loads(Path(str(raw)+'.report.json').read_text());im=Image.open(raw)
 if report['gpu']['error'] or report['gpu']['lost'] or report['errors']:raise RuntimeError('Invalid GPU report '+sheet['id'])
 if list(im.size)!=sheet['board']['roomPx']:raise RuntimeError('Wrong A2 dimensions '+str(im.size))
 flags=report['flags'];im=im.convert('RGB');scale=12/sheet['board']['pxPerMm'];rendered=0
 for stroke in sheet['strokes']:
  rect=sheet['board']['slots'].get(str(stroke['n']))
  if not rect:continue
  crop=im.crop(rect);crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
  src=f"img/{sheet['id']}/{stroke['n']:03d}-app-{version}.jpg";path=dest/src;path.parent.mkdir(parents=True,exist_ok=True);crop.save(path,quality=92)
  stroke.setdefault('app',{})[version]={'src':src,'w':crop.width,'h':crop.height};rendered+=1
 reports.append(dict(sheet=sheet['id'],slots=rendered,rawSha256=hashlib.sha256(raw.read_bytes()).hexdigest(),flags=flags,report=report))
if not reports:raise RuntimeError('no reports')
a.setdefault('versions',[]).append({'id':version,'commit':'c1997fee56175bddc99961604dc52f8add829a7a','date':'2026-10-06','subject':'Принятая DEV версия: общая вода и плавная сушка','rendered':datetime.datetime.now(datetime.timezone.utc).isoformat(),'devReview':True,'flags':reports[0]['flags']})
(dest/'archive.json').write_text(json.dumps(a,ensure_ascii=False,indent=1)+'\n');(dest/'archive.js').write_text('window.STROKE_ARCHIVE = '+json.dumps(a,ensure_ascii=False)+';\n')
(base/'manifest.json').write_text(json.dumps({'version':version,'published':False,'sheets':reports,'missingRoom':['12'],'totalSlots':sum(r['slots'] for r in reports)},ensure_ascii=False,indent=1)+'\n')
# Contact sheet: photo, preceding canonical version, accepted version for every slot.
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14);rows=[]
for sheet in a['sheets']:
 for st in sheet['strokes']:
  if version not in st.get('app',{}):continue
  photo=st.get('dry') or st['wet'][-1];old=st.get('app',{}).get('0a78ab53');new=st['app'][version];row=Image.new('RGB',(900,210),'white');d=ImageDraw.Draw(row)
  for i,(name,frame) in enumerate([('Фото',photo),('Предыдущая 0a78ab53',old),('Принятая c1997fee-review',new)]):
   d.text((i*300+5,3),f"Лист {sheet['id']} №{st['n']} · {name}",fill='black',font=font)
   if frame:
    image=Image.open(dest/frame['src']).convert('RGB');image.thumbnail((290,185));row.paste(image,(i*300+(300-image.width)//2,22+(185-image.height)//2))
  rows.append(row)
contact=Image.new('RGB',(900,210*len(rows)),'white')
for i,row in enumerate(rows):contact.paste(row,(0,210*i))
contact.save(base/'contact.jpg',quality=85)
print(json.dumps({'slots':len(rows),'sheets':[r['sheet'] for r in reports],'version':version}))
