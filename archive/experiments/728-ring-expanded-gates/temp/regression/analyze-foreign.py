from pathlib import Path
from PIL import Image, ImageDraw
import json,sys
r=Path(sys.argv[1]);report=json.loads((r/'report.json').read_text());results=[];crops=[]
roi=(1280,154,1776,449);core=(1350,270,1720,300)
for a in report['arms']:
    if not isinstance(a.get('finalPNG'),dict):continue
    stem=a['revision']+'-'+a['policy'];im=Image.open(r/a['finalPNG']['file']).convert('RGBA');p=Image.open(r/a['transparentPNG']['file']).convert('RGBA')
    c=im.crop(roi).convert('RGB');c.save(r/(stem+'-foreign-slot1.png'));crops.append((stem,c))
    pixels=list(p.crop(roi).getdata());body=list(p.crop(core).getdata())
    sums=[sum(v[k] for v in pixels) for k in range(4)]
    results.append({'arm':stem,'worldROI':roi,'fixedCore':core,'scope':'PNG optical alpha/support, not physical mass','nonzero':sum(v[3]>0 for v in pixels),'alphaSum':sums[3],'premultRGB':[sum(v[k]*v[3]/255 for v in pixels) for k in range(3)],'coreAlpha':sum(v[3] for v in body)/len(body),'bakedCalls':a.get('bakedCalls'),'material':a['material']})
if crops:
    atlas=Image.new('RGB',(496*len(crops),325),'white');draw=ImageDraw.Draw(atlas)
    for i,(n,c) in enumerate(crops):atlas.paste(c,(496*i,30));draw.text((496*i+5,8),n,fill='black')
    atlas.save(r/'foreign-atlas.png')
(r/'foreign-metrics.json').write_text(json.dumps(results,indent=2));print([(x['arm'],x['nonzero'],x['coreAlpha']) for x in results])
