import json,hashlib,sys
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
p=Path(__file__).parent;name=sys.argv[1];r=json.loads((p/name/'report.json').read_text());i=json.loads((p/'inputs.json').read_text());out=Image.new('RGB',(1500,330*len(i['cases'])),'white');d=ImageDraw.Draw(out);qc=[]
for j,c in enumerate(i['cases']):
 old=Image.open(p/'baseline'/f"{c['id']}.png").crop(c['box']);new=Image.open(p/name/f"{c['id']}.png").crop(c['box']);delta=np.abs(np.array(old).astype(float)-np.array(new).astype(float));report=next(t for t in r['cases'] if t['id']==c['id']);qc.append({'id':c['id'],'mean':float(delta.mean()),'max':float(delta.max()),'gl':report['error'],'lost':report['lost'],'patchCounts':report['customReplacements'],'hashOK':hashlib.sha256((p/name/f"{c['id']}.png").read_bytes()).hexdigest()==report['pngSha256']})
 for n,im in enumerate([Image.open(Path('docs/reference/strokes')/c['reference']),old,new]):
  im.thumbnail((480,295));out.paste(im,(n*500+(480-im.width)//2,j*330+30));d.text((n*500+10,j*330+8),c['id']+[' photo',' baseline',' '+name][n],fill='black')
out.save(p/(name+'-contact.jpg'),quality=90);(p/(name+'-qc.json')).write_text(json.dumps({'complete':r['complete'],'errors':r['errors'],'specSHA':r['experimentSha256'],'cases':qc},indent=2));print(qc)
