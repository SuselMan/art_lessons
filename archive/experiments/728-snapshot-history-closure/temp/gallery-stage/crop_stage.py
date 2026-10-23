"""Private CPU staging only; never writes gallery current/data/previews."""
import argparse, json, hashlib, datetime
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--allow-partial',action='store_true');args=p.parse_args()
b=Path(__file__).parent;a=json.loads((b/'archive-source.json').read_text());inventory=json.loads((b/'comparison-inventory.json').read_text());version='f877b418-phase-baked-20261007';commit='f877b418bc52ac8b0ebb938f8d77c533722a7906';out=args.out;out.mkdir(parents=True,exist_ok=True)
sha=lambda q:hashlib.sha256(q.read_bytes()).hexdigest()
manifest={'version':version,'commit':commit,'scope':'Frozen f877 renderer plus opt-in phase and baked fibres; sourceFilmRebase ON; not current combined frontend','publication':False,'sheets':[],'missing':[],'crops':0}
overlay={'versions':[{'id':version,'commit':commit,'date':'2026-10-07','subject':'Эксперимент: phase + baked fibres на замороженном f877','rendered':datetime.datetime.now(datetime.timezone.utc).isoformat()}],'sheets':[]}
by_sheet={s['id']:s for s in a['sheets']}
for entry in inventory['sheets']:
 sid=entry['sheet'];s=by_sheet[sid];png=args.raw/(f'sheet{sid}-on-retry1.png' if sid=='4' else f'sheet{sid}-on.png');report=Path(str(png)+'.report.json');journal=args.raw/entry['journal']
 if not png.exists() or not report.exists():manifest['missing'].append(sid);continue
 r=json.loads(report.read_text());model=r.get('model',{})
 if r.get('errors') or r['gpu']['error'] or r['gpu']['lost'] or any('INVALID_' in w for w in r.get('glWarnings',[])):raise RuntimeError('Invalid GL '+sid)
 if not (model.get('phase') and model.get('fibres') and model.get('rebase')) or r.get('version')!='f877b418-ring-baked-on':raise RuntimeError('Wrong source/flags '+sid)
 if sha(journal)!=entry['sha256']:raise RuntimeError('Journal changed '+sid)
 with Image.open(png) as original:
  if list(original.size)!=s['board']['roomPx'] or list(original.size)!=[model['page']['w'],model['page']['h']]:raise RuntimeError('Page size '+sid)
  rgba=original.convert('RGBA');white=Image.new('RGBA',rgba.size,(255,255,255,255));im=Image.alpha_composite(white,rgba).convert('RGB')
  row={'id':sid,'strokes':[]};crops=[];k=12/s['board']['pxPerMm']
  for stroke in s['strokes']:
   rect=entry['slots'].get(str(stroke['n']))
   if rect is None:continue
   if rect!=s['board']['slots'].get(str(stroke['n'])):raise RuntimeError('Slot mismatch '+sid)
   x0,y0,x1,y1=rect
   if not (0<=x0<x1<=im.width and 0<=y0<y1<=im.height):raise RuntimeError('Bad crop '+sid)
   c=im.crop(rect);c=c.resize((round(c.width*k),round(c.height*k)),Image.Resampling.LANCZOS)
   rel=f'img/{sid}/{stroke["n"]:03d}-app-{version}.jpg';target=out/rel;target.parent.mkdir(parents=True,exist_ok=True);c.save(target,quality=92)
   frame={'src':rel,'w':c.width,'h':c.height};row['strokes'].append({'n':stroke['n'],'app':{version:frame}});crops.append({'n':stroke['n'],'slot':rect,'file':rel,'sha256':sha(target),'size':[c.width,c.height]})
  manifest['sheets'].append({'sheet':sid,'rawFile':png.name,'rawSHA':sha(png),'reportSHA':sha(report),'journalSHA':sha(journal),'model':model,'crops':crops});manifest['crops']+=len(crops);overlay['sheets'].append(row)
manifest['complete']=len(manifest['sheets'])==11 and manifest['crops']==85 and not manifest['missing']
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');(out/'overlay-draft.json').write_text(json.dumps(overlay,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'complete':manifest['complete'],'sheets':len(manifest['sheets']),'crops':manifest['crops'],'missing':manifest['missing']}))
if not manifest['complete'] and not args.allow_partial:raise RuntimeError('Incomplete staging; not publishable')
