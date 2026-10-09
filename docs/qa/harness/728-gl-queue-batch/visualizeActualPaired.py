"""Actual captured moments; local optical approximation, NOT Grafetto renderer."""
import sys,json,math
import zlib,struct,base64
r=json.load(sys.stdin);v=r.pop('visual');n=128;source=v['source'];positive=v['positive'];old=v['oldP'];moved=v['coarseMovedP'];origin=r['passport']['origin']
def bilerp(a,x,y,c):
 x0=math.floor(x);y0=math.floor(y);fx=x-x0;fy=y-y0
 def g(xx,yy):return a[(max(0,min(127,yy))*128+max(0,min(127,xx)))*4+c]
 return (1-fy)*((1-fx)*g(x0,y0)+fx*g(x0+1,y0))+fy*((1-fx)*g(x0,y0+1)+fx*g(x0+1,y0+1))
residual=[]
for y in range(n):
 for x in range(n):
  cx=(origin[0]+x+.5)/8-.5;cy=(origin[1]+y+.5)/8-.5
  residual.append(source[(y*n+x)*8+3]+bilerp(moved,cx,cy,3)-bilerp(old,cx,cy,3))
neg=[x for x in residual if x<0];r['scalarResidualApprox']={'negativePixels':len(neg),'minimum':min(residual),'clampAdded':sum(-x for x in neg),'limitations':'Scalar P only; captured oldC/initialC absent. One same-driver coarse CPU pass; excludes fixed mobile weight and sampler detail.'}
# Local tau and thickness from actual source P/C; no ring taps, paper or prior.
def color(a,i):
 mass=2*a[i*8+3];tau=[4*a[i*8+4+c]/max(a[i*8+7],5e-5) for c in range(3)]
 thickness=mass*.55/.54
 if thickness>1:thickness=1+.6*(1-math.exp(-(thickness-1)/.6))
 return tuple(round(255*math.exp(-t*thickness)) for t in tau)
panels=[]
for title,kind in [('Captured P density','source'),('Residual P clipped (approx)','residual'),('Positive P density','positive'),('Source local optical approx','sourcecolor'),('Positive local optical approx','positivecolor')]:
 pix=[]
 for i in range(n*n):
  if kind.endswith('color'):pix.append(color(source if kind=='sourcecolor' else positive,i))
  else:
   mass=source[i*8+3] if kind=='source' else positive[i*8+3] if kind=='positive' else max(0,residual[i]);g=round(255*math.exp(-4*mass));pix.append((g,g,g))
 panels.append((title,pix))
width=5*266;height=300;canvas=bytearray([255])*(width*height*3)
for k,(title,pix) in enumerate(panels):
 for y in range(256):
  for x in range(256):
   color=pix[(127-y//2)*128+x//2];idx=((y+24)*width+k*266+x)*3;canvas[idx:idx+3]=bytes(color)
def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
raw=b''.join(b'\0'+canvas[y*width*3:(y+1)*width*3] for y in range(height));png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
base=sys.argv[1];open(base+'/comparison.png','wb').write(png)
labels=''.join('<text x="%d" y="16">%s</text>'%(k*266+4,title) for k,(title,_)in enumerate(panels))
svg='<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="330"><image width="%d" height="300" href="data:image/png;base64,%s"/><g font-size="12">%s<text x="4" y="318">Actual one-step CPU comparison; local optical approximation excludes paper/ring/reveal. Not animation acceptance.</text></g></svg>'%(width,width,base64.b64encode(png).decode(),labels)
open(base+'/comparison.svg','w').write(svg);json.dump(r,open(base+'/visual-metrics.json','w'),indent=2)
print(json.dumps(r['scalarResidualApprox']))
