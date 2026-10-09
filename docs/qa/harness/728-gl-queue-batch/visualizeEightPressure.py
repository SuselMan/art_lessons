import json,sys,math,zlib,struct,base64
r=json.load(sys.stdin);v=r.pop('visual');width=3*266;height=300;canvas=bytearray([255])*(width*height*3)
for k,role in enumerate(['source','four','eight']):
 a=v[role]
 for y in range(256):
  for x in range(256):
   i=(127-y//2)*128+x//2;tau=[4*a[i*8+4+c]/max(a[i*8+7],5e-5)for c in range(3)];t=2*a[i*8+2]*.55/.54
   if t>1:t=1+.6*(1-math.exp(-(t-1)/.6))
   color=[round(255*math.exp(-q*t))for q in tau];j=((y+24)*width+k*266+x)*3;canvas[j:j+3]=bytes(color)
def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
raw=b''.join(b'\0'+canvas[y*width*3:(y+1)*width*3]for y in range(height));png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'');base=sys.argv[1];open(base+'/eight-actual-comparison.png','wb').write(png)
labels=['Actual source local optical','Actual4 algebra CPU12 (frozen)','Experimental8 CPU12 matched M2'];svg='<svg xmlns="http://www.w3.org/2000/svg" width="798" height="330"><image width="798" height="300" href="data:image/png;base64,%s"/><g font-size="12">%s<text x="4" y="318">Actual source/pressure input, CPU only; local optical approximation, no paper/reveal. No GPU8/artist acceptance.</text></g></svg>'%(base64.b64encode(png).decode(),''.join('<text x="%d" y="16">%s</text>'%(k*266+4,s)for k,s in enumerate(labels)));open(base+'/eight-actual-comparison.svg','w').write(svg)
