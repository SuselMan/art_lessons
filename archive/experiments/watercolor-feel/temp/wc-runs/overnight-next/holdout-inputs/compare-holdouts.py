import json,hashlib,sys
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
p=Path(__file__).parent.parent;name=sys.argv[1];base=sys.argv[2] if len(sys.argv)>2 else 'accepted-parent';r=json.loads((p/name/'report.json').read_text());allinputs=json.loads((p/'holdout-inputs/comparison-inputs.json').read_text());i={'cases':[next(c for c in allinputs['cases'] if c['id']==t['id']) for t in r['cases']]};out=Image.new('RGB',(1500,330*len(i['cases'])),'white');d=ImageDraw.Draw(out);qc=[]
for j,c in enumerate(i['cases']):
 old=Image.open(p/base/f"{c['id']}.png").crop(c['box']);new=Image.open(p/name/f"{c['id']}.png").crop(c['box']);delta=np.abs(np.array(old).astype(float)-np.array(new).astype(float));report=next(t for t in r['cases'] if t['id']==c['id']);qc.append({'id':c['id'],'mean':float(delta.mean()),'max':float(delta.max()),'gl':report['error'],'lost':report['lost'],'shaderCounts':report['customReplacements'],'hashOK':hashlib.sha256((p/name/f"{c['id']}.png").read_bytes()).hexdigest()==report['pngSha256']})
 for n,im in enumerate([Image.open(Path('docs/reference/strokes')/c['reference']),old,new]):
  im.thumbnail((480,295));out.paste(im,(n*500+(480-im.width)//2,j*330+30));d.text((n*500+10,j*330+8),c['id']+[' photo',' '+base,' '+name][n],fill='black')
out.save(p/(name+'-vs-'+base+'-contact.jpg'),quality=90);(p/(name+'-vs-'+base+'-qc.json')).write_text(json.dumps({'complete':r['complete'],'errors':r['errors'],'moduleCounts':r['modulePatchCounts'],'specSHA':r['experimentSha256'],'cases':qc},indent=2));print(qc)
