import json
from pathlib import Path
from PIL import Image, ImageDraw
base=Path(__file__).parent
archive=json.loads((Path.home()/'.local/share/stroke-gallery/current/docs/reference/strokes/archive.json').read_text())
boards=json.loads((Path.home()/'.local/share/stroke-gallery/data/boards.json').read_text())
rows=[]; inventory=[]
for sheet in archive['sheets']:
 src=base/'results'/('sheet'+sheet['id']+'.png')
 if not src.exists(): continue
 im=Image.open(src).convert('RGBA'); report=json.loads(Path(str(src)+'.report.json').read_text())
 if report['errors'] or report['gpu']['lost'] or report['gpu']['error']: raise RuntimeError('GPU failed '+sheet['id'])
 if im.size!=(3508,2480): raise RuntimeError('Wrong physical export '+str(im.size))
 board=boards.get(sheet['id'],sheet['board']); thumbs=[]
 for n,box in board['slots'].items():
  crop=im.crop(tuple(box)); alpha=crop.getchannel('A'); count=sum(v>0 for v in alpha.getdata())
  inventory.append({'sheet':sheet['id'],'n':n,'pixels':count,'size':crop.size,'version':report['version']})
  white=Image.new('RGBA',crop.size,'white');white.alpha_composite(crop)
  thumb=white.convert('RGB');thumb.thumbnail((230,180));tile=Image.new('RGB',(250,210),'white');tile.paste(thumb,((250-thumb.width)//2,25));ImageDraw.Draw(tile).text((8,5),'sheet '+sheet['id']+' / '+str(n)+' / '+str(count),fill='black');thumbs.append(tile)
 for i in range(0,len(thumbs),4):
  row=Image.new('RGB',(1000,210),'#ddd')
  for j,t in enumerate(thumbs[i:i+4]):row.paste(t,(j*250,0))
  rows.append(row)
canvas=Image.new('RGB',(1000,len(rows)*210),'white')
for i,r in enumerate(rows):canvas.paste(r,(0,i*210))
canvas.save(base/'contact.jpg',quality=90)
(base/'crop-inventory.json').write_text(json.dumps(inventory,indent=2))
print(json.dumps({'slots':len(inventory),'empty':[(x['sheet'],x['n'])for x in inventory if not x['pixels']],'sheets':sorted(set(x['sheet']for x in inventory))}))
