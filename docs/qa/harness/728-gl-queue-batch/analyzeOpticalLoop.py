"""Read-only tiny PNG analysis. Optical darkness is NOT conserved physical pigment mass."""
import json,struct,zlib,pathlib,hashlib,math,sys
base=pathlib.Path(sys.argv[1])
def decode(p):
 b=p.read_bytes();assert b[:8]==b'\x89PNG\r\n\x1a\n';offset=8;packed=b''
 while offset<len(b):
  size=struct.unpack('>I',b[offset:offset+4])[0];name=b[offset+4:offset+8];data=b[offset+8:offset+8+size];offset+=size+12
  if name==b'IHDR':w,h,bits,color,cm,fm,interlace=struct.unpack('>IIBBBBB',data);assert bits==8 and color in (2,6) and interlace==0
  if name==b'IDAT':packed+=data
 channels=3 if color==2 else 4;stride=w*channels;raw=zlib.decompress(packed);rows=[];offset=0;prev=bytearray(stride)
 def paeth(a,b,c):
  q=a+b-c;d=[abs(q-a),abs(q-b),abs(q-c)];return [a,b,c][d.index(min(d))]
 for y in range(h):
  kind=raw[offset];offset+=1;row=bytearray(raw[offset:offset+stride]);offset+=stride
  for x in range(stride):
   a=row[x-channels] if x>=channels else 0;c=prev[x-channels] if x>=channels else 0;b=prev[x]
   predictor=[0,a,b,(a+b)//2,paeth(a,b,c)][kind];row[x]=(row[x]+predictor)%256
  rows.extend(tuple(row[x:x+3]) for x in range(0,stride,channels));prev=row
 return w,h,rows
summary=json.load(open(base/'summary.json'));frames=[];original=None
for f in summary['rows'][0]['opticalFrames']:
 p=base/f['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256'];w,h,rgb=decode(p);density=[1-min(c)/255 for c in rgb];total=sum(density);cx=sum((i%w+.5)*d for i,d in enumerate(density))/total;cy=sum((i//w+.5)*d for i,d in enumerate(density))/total;m2=sum(((i%w+.5-cx)**2+(i//w+.5-cy)**2)*d for i,d in enumerate(density))/total
 if original is None:original=rgb
 differences=[abs(c[k]-original[i][k]) for i,c in enumerate(rgb) for k in range(3)];frames.append({'step':f['step'],'actualElapsedMs':f['metadata']['elapsed'],'rgbChangedPixels':sum(c!=original[i] for i,c in enumerate(rgb)),'rgbMaxAbsVs0':max(differences),'rgbMeanAbsVs0':sum(differences)/len(differences),'darknessWeightedCentre':[cx,cy],'darknessWeightedSecondMoment':m2,'darknessSum':total,'supportPixelsDensityOver1percent':sum(d>.01 for d in density)})

# Fixed-centre angular harmonic on optical darkness, excluding radius<4px.
for result,f in zip(frames,summary['rows'][0]['opticalFrames']):
 _,_,rgb=decode(base/f['file']);cx,cy=frames[0]['darknessWeightedCentre'];harmonics={}
 for order in [4,8]:
  a=b=total=0
  for i,c in enumerate(rgb):
   dx=i%w+.5-cx;dy=i//w+.5-cy;rr=math.hypot(dx,dy)
   if rr<4:continue
   density=1-min(c)/255;angle=math.atan2(dy,dx);a+=density*math.cos(order*angle);b+=density*math.sin(order*angle);total+=density
  harmonics['h%d'%order]={'magnitude':math.hypot(a,b)/total,'cos':a/total,'sin':b/total}
 grid={}
 for axis in [0,1]:
  a=b=total=0
  for i,c in enumerate(rgb):
   density=1-min(c)/255;coord=(i%w+.5) if axis==0 else (i//w+.5);a+=density*math.cos(2*math.pi*coord/8);b+=density*math.sin(2*math.pi*coord/8);total+=density
  grid['x' if axis==0 else 'y']=math.hypot(a,b)/total
 result['period8OpticalModulation']=grid
 result['fixedCentreHarmonics']=harmonics

print(json.dumps({'scope':'Actual GPU optical PNG deformation only; darkness != pigment mass. No paper/water/reveal or physical latency interpretation.','frames':frames},indent=2))
