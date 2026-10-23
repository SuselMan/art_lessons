import json,datetime,hashlib
from pathlib import Path
from PIL import Image
b=Path(__file__).parent;a=json.loads((b/'archive-source.json').read_text());v='8aa7e9f0-rooms-20261006';dest=b/'new-assets';reports=[]
for s in a['sheets']:
 if not s.get('board',{}).get('room'):continue
 p=b/f'sheet{s["id"]}-8aa7e9f0.png';r=json.loads(Path(str(p)+'.report.json').read_text())
 if r['errors'] or r['gpu']['error'] or r['gpu']['lost'] or any('INVALID_' in w for w in r.get('glWarnings',[])):raise RuntimeError('GPU report '+s['id'])
 im=Image.open(p)
 if list(im.size)!=s['board']['roomPx']:raise RuntimeError('Dimensions '+s['id'])
 if im.mode=='RGBA' and im.getextrema()[3][1]==0:raise RuntimeError('Empty board '+s['id'])
 im=im.convert('RGB');k=12/s['board']['pxPerMm'];count=0
 for st in s['strokes']:
  rect=s['board']['slots'].get(str(st['n']))
  if not rect:continue
  c=im.crop(rect);c=c.resize((round(c.width*k),round(c.height*k)),Image.Resampling.LANCZOS)
  src=f'img/{s["id"]}/{st["n"]:03d}-app-{v}.jpg';q=dest/src;q.parent.mkdir(parents=True,exist_ok=True);c.save(q,quality=92)
  st.setdefault('app',{})[v]={'src':src,'w':c.width,'h':c.height};count+=1
 reports.append({'sheet':s['id'],'crops':count,'rawSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'report':r})
a.setdefault('versions',[]).append({'id':v,'commit':'8aa7e9f000ffd2a8713b2f6d69d066e6cc75c646','date':'2026-10-06','subject':'Последние повторы всех комнат — production 8aa7e9f','rendered':datetime.datetime.now(datetime.timezone.utc).isoformat()})
(dest/'archive.json').write_text(json.dumps(a,ensure_ascii=False,indent=1)+'\n');(dest/'archive.js').write_text('window.STROKE_ARCHIVE = '+json.dumps(a,ensure_ascii=False)+';\n');(b/'manifest.json').write_text(json.dumps({'version':v,'sheets':reports,'crops':sum(x['crops'] for x in reports)},ensure_ascii=False,indent=1));print(sum(x['crops'] for x in reports))
