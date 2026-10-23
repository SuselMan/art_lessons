import json,datetime,hashlib
from pathlib import Path
from PIL import Image
base=Path(__file__).parent
service=Path.home()/'.local/share/stroke-gallery'
a=json.loads((service/'current/docs/reference/strokes/archive.json').read_text())
boards=json.loads((service/'data/boards.json').read_text())
version='f685fe1c-defaults-20261007'
stage=base/'prepared';stage.mkdir(exist_ok=True)
overlay={'versions':[{'id':version,'commit':'f685fe1c33aab70618c5ee7e9522bb965e5a1cdb','date':'2026-10-07','subject':'Текущая модель: исправленная диффузия и baked fibres; живое рисование требует исправления','rendered':datetime.datetime.now(datetime.timezone.utc).isoformat()}],'sheets':[]}
inventory=[]
for s in a['sheets']:
 source=base/'results'/('sheet'+s['id']+'.png')
 report=json.loads(Path(str(source)+'.report.json').read_text())
 assert report['version']==overlay['versions'][0]['commit'] and not report['errors'] and not report['gpu']['lost'] and report['gpu']['error']==0
 im=Image.open(source).convert('RGBA');assert im.size==(3508,2480)
 board=boards.get(s['id'],s['board']); sheet={'id':s['id'],'strokes':[]}
 for n,box in board['slots'].items():
  crop=im.crop(tuple(box));assert crop.getchannel('A').getextrema()[1]>0
  white=Image.new('RGBA',crop.size,'white');white.alpha_composite(crop)
  k=12/board['pxPerMm'];white=white.convert('RGB').resize((round(crop.width*k),round(crop.height*k)),Image.Resampling.LANCZOS)
  relative=Path('img')/s['id']/(str(int(n)).zfill(3)+'-app-'+version+'.jpg');out=stage/relative;out.parent.mkdir(parents=True,exist_ok=True);white.save(out,quality=92)
  sheet['strokes'].append({'n':int(n),'app':{version:{'src':'preview/gallery-'+version+'/'+relative.as_posix(),'w':white.width,'h':white.height}}})
  inventory.append({'sheet':s['id'],'n':int(n),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'sourceReport':str(source)+'.report.json'})
 overlay['sheets'].append(sheet)
assert len(inventory)==85
(stage/'overlay.json').write_text(json.dumps(overlay,ensure_ascii=False,indent=2))
(stage/'inventory.json').write_text(json.dumps(inventory,indent=2))
print({'sheets':len(overlay['sheets']),'strokes':len(inventory),'version':version})
