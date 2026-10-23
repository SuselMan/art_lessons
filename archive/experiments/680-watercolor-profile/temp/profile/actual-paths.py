from PIL import Image,ImageDraw
import json,base64,struct,io
ops=json.load(open('../680-combined-stability/temp/KJc0OoVo/ops.json'));sel=[14,20,22,25,27,29,34];im=Image.new('RGB',(420*4,450*2),'white');draw=ImageDraw.Draw(im)
for i,seq in enumerate(sel):
 o=next(o for o in ops if o.get('seq')==seq);b=base64.b64decode(o['dabsPacked'].split(':')[1]);f=struct.unpack('<'+'f'*(len(b)//4),b);p=[f[j:j+10] for j in range(0,len(f),10)];xmin=min(x[0] for x in p);xmax=max(x[0] for x in p);ymin=min(x[1] for x in p);ymax=max(x[1] for x in p);s=min(350/max(1,xmax-xmin),350/max(1,ymax-ymin));ox=(i%4)*420+25;oy=(i//4)*450+60
 draw.text((ox,oy-40),f'KJ seq{seq} {o["preset"]} n{len(p)}',fill='black');draw.line([(ox+(x[0]-xmin)*s,oy+(x[1]-ymin)*s) for x in p],fill=(70,40,110),width=3)
im.save('temp/contact-budget/actual-spiral-paths.png');b=io.BytesIO();im.save(b,format='PNG');print(base64.b64encode(b.getvalue()).decode())
