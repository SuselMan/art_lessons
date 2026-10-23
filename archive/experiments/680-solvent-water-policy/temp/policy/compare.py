from PIL import Image,ImageDraw
from pathlib import Path
p=Path(__file__).parent
names=['natural-'+policy+'-V-fluid-actual15-'+mode for policy in ['legacy','bottomless','finite'] for mode in ['direct','matched-prewater']]
a=Image.new('RGB',(180*len(names),940),'white');d=ImageDraw.Draw(a)
for i,n in enumerate(names):
 f=p/'gpu'/(n+'.png')
 if f.exists():
  im=Image.open(f).convert('RGB').crop((210,0,350,900));a.paste(im,(i*180,35));d.text((i*180,0),n.replace('natural-','').replace('-V-fluid-actual15-','\n'),fill='black')
a.save(p/'natural-comparison.jpg')
