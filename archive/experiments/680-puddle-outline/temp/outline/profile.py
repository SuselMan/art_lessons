import numpy as np,json
from PIL import Image,ImageOps,ImageDraw
from pathlib import Path
base=Path('temp/outline/baseline-small'); shape=(1536,1536)
p=np.fromfile(base/'318-precarry.rgba',dtype=np.uint8).reshape(shape)
a=np.fromfile(base/'318-carry-last.rgba',dtype=np.uint8).reshape(shape)
c=np.fromfile(base/'318-cost.rgba',dtype=np.uint8).reshape(shape)
y,x=np.where(p>3); print('footprint',x.min(),x.max(),y.min(),y.max());cx=(x.max()+x.min())/2;cy=(y.max()+y.min())/2
yy,xx=np.mgrid[:1536,:1536];r=np.hypot(xx-cx,yy-cy)
rows=[]
for k in range(80):
 mask=(r>=k-.5)&(r<k+.5)
 rows.append(dict(r=k,pre=float(p[mask].mean()),post=float(a[mask].mean()),cost=float(c[mask].mean())))
print(json.dumps(rows,indent=2));Path('temp/outline/profile.json').write_text(json.dumps(rows,indent=2))
box=(int(cx)-100,int(cy)-100,int(cx)+100,int(cy)+100)
ims=[]
for data,name in [(p,'before carry'),(a,'after carry'),(c,'cost')]:
 im=Image.fromarray(data).crop(box).resize((400,400));im=ImageOps.autocontrast(im).convert('RGB');ImageDraw.Draw(im).text((8,8),name,fill=(255,0,0));ims.append(im)
out=Image.new('RGB',(1200,400));[out.paste(im,(i*400,0)) for i,im in enumerate(ims)];out.save('temp/outline/fields.jpg')
