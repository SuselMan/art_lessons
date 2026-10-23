import json,hashlib,datetime,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
base=Path(__file__).parent;dest=base/'preview-stage';a=json.loads((base/'archive-source.json').read_text());version='1e49aa99-clip';reports=[]
selected=set(sys.argv[1:] or [s['id'] for s in a['sheets'] if s.get('board',{}).get('room')])
for sheet in a['sheets']:
 if sheet['id'] not in selected:continue
 raw=base/('sheet'+sheet['id']+'-1e49aa99.png');report=json.loads(Path(str(raw)+'.report.json').read_text());im=Image.open(raw)
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
a['versions']=[v for v in a.get('versions',[]) if v['id']!=version]
a.setdefault('versions',[]).append({'id':version,'commit':'1e49aa99','date':'2026-10-06','subject':'Принятая акварель: исправлена область композита растекания','rendered':datetime.datetime.now(datetime.timezone.utc).isoformat(),'devReview':False,'flags':reports[0]['flags']})
(dest/'archive.json').write_text(json.dumps(a,ensure_ascii=False,indent=1)+'\n');(dest/'archive.js').write_text('window.STROKE_ARCHIVE = '+json.dumps(a,ensure_ascii=False)+';\n')
(base/'manifest.json').write_text(json.dumps({'version':version,'published':False,'sheets':reports,'missingRoom':['12'],'totalSlots':sum(r['slots'] for r in reports)},ensure_ascii=False,indent=1)+'\n')
print(json.dumps({'slots':sum(r['slots'] for r in reports),'sheets':[r['sheet'] for r in reports],'version':version}))
