from pathlib import Path
import numpy as np,json
from PIL import Image,ImageDraw
n=Path('temp/wc-runs/overnight-next');d=n/'sheet7-ring-audit';out=Image.new('RGB',(1500,720),'white');draw=ImageDraw.Draw(out);box=(946,574,1314,774)
for j,folder in enumerate(['production-physical22-support-pad-control','calibrated-pool-combo-five','saturating-beer-softshoulder16-four']):
 f=n/folder;channels={}
 for role in ['u_inkLoad','u_inkColor','u_strokeCoverage']:
  a=np.zeros((1024,2048,4),np.uint8)
  for x in [0,1024]:a[:,x:x+1024]=np.fromfile(f/f's7-n3-{x}_0-{role}.rgba',np.uint8).reshape(1024,1024,4)[::-1]
  channels[role]=a
 imgs=[Image.fromarray(channels['u_inkLoad'][:,:,2]).convert('RGB'),Image.fromarray(channels['u_inkLoad'][:,:,3]).convert('RGB'),Image.fromarray(channels['u_inkColor'][:,:,:3]),Image.fromarray(channels['u_strokeCoverage'][:,:,3]).convert('RGB')]
 for k,(im,label)in enumerate(zip(imgs,['P.B','P.A','C.rgb','cov.A'])):im=im.crop(box);im.resize((368,200));out.paste(im,(k*375,j*240+30));draw.text((k*375,j*240+5),folder+' '+label,fill='black')
out.save(d/'cached-fields.png')
