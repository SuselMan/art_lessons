import json
from PIL import Image,ImageDraw
import numpy as np
from pathlib import Path
p=Path('temp/wet-tone/hardware');out={}
def diff(a,b):
 x=np.asarray(Image.open(p/a).convert('RGBA')).astype(int);y=np.asarray(Image.open(p/b).convert('RGBA')).astype(int);d=abs(x-y);return {'pixels':int(np.any(d,axis=2).sum()),'max':int(d.max())}
for b in ['mild','candidate']:out['canonical-'+b]=diff('baseline-exportWhileWet.png',b+'-exportWhileWet.png')
for a,b in [('dryAfter.png','rebuild.png'),('redo.png','rebuild.png')]:out[a+'-'+b]=diff(a,b)
contact=Image.new('RGB',(640,3*510),'white');dr=ImageDraw.Draw(contact)
for i,name in enumerate(['baseline','mild','candidate']):
 im=Image.open(p/(name+'-screenWet.png')).convert('RGB');a=np.asarray(im);out[name]={'size':im.size,'bare':a[165:195,150:250].mean((0,1)).tolist(),'paint':a[165:195,390:490].mean((0,1)).tolist()};contact.paste(im,(0,i*510+30));dr.text((10,i*510+5),name,fill='black')
contact.save(p/'compare.jpg');json.dump(out,open(p/'offline.json','w'),indent=2);print(json.dumps(out))
