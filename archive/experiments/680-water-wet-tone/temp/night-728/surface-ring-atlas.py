from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
p=Path(__file__).parent
a=Image.open(p/'surface-ring-on-layer.png').convert('RGB');b=Image.open(p/'surface-ring-off-layer.png').convert('RGB');x=np.array(a).astype(int);m=(x[:,:,0]-x[:,:,1]>8)&(x[:,:,2]-x[:,:,1]>12);yy,xx=np.where(m)
assert len(xx)>0
box=(max(0,int(xx.min())-40),max(0,int(yy.min())-40),min(a.width,int(xx.max())+41),min(a.height,int(yy.max())+41))
on=a.crop(box);off=b.crop(box);sheet=Image.new('RGB',(on.width*2,on.height+24),'white');sheet.paste(off,(0,24));sheet.paste(on,(on.width,24));d=ImageDraw.Draw(sheet);d.text((5,4),'OFF same journal',(0,0,0));d.text((on.width+5,4),'ON native = rebuild',(0,0,0));sheet.save(p/'surface-ring-on-off-atlas.jpg');print({'crop':box,'size':sheet.size})
