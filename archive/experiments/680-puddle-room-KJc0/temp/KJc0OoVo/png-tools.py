import struct,zlib,binascii

def read(p):
 b=open(p,'rb').read();off=8;packed=b''
 while off<len(b):
  n=struct.unpack('>I',b[off:off+4])[0];t=b[off+4:off+8];d=b[off+8:off+8+n];off+=n+12
  if t==b'IHDR':w,h,depth,typ,*_=struct.unpack('>IIBBBBB',d);assert depth==8 and typ in (2,6);ch=3 if typ==2 else 4
  if t==b'IDAT':packed+=d
 raw=zlib.decompress(packed);stride=w*ch;out=bytearray();prev=bytearray(stride)
 for y in range(h):
  f=raw[y*(stride+1)];r=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
  for x in range(stride):
   a=r[x-ch]if x>=ch else 0;c=prev[x-ch]if x>=ch else 0;bb=prev[x]
   if f==1:v=a
   elif f==2:v=bb
   elif f==3:v=(a+bb)//2
   elif f==4:
    p=a+bb-c;pa=abs(p-a);pb=abs(p-bb);pc=abs(p-c);v=a if pa<=pb and pa<=pc else bb if pb<=pc else c
   else:v=0
   r[x]=(r[x]+v)&255
  out+=r;prev=r
 return w,h,ch,out

def write(p,w,h,ch,raw):
 def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',binascii.crc32(t+d)&0xffffffff)
 rows=b''.join(b'\0'+raw[y*w*ch:(y+1)*w*ch]for y in range(h))
 b=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2 if ch==3 else 6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'');open(p,'wb').write(b)

def crop(src,dst,x,y,cw,ch):
 w,h,c,raw=read(src);assert x+cw<=w and y+ch<=h
 out=b''.join(raw[((y+j)*w+x)*c:((y+j)*w+x+cw)*c]for j in range(ch));write(dst,cw,ch,c,out)

def diff(a,b):
 w,h,c,x=read(a);ww,hh,cc,y=read(b);assert(w,h,c)==(ww,hh,cc)
 ds=[max(abs(x[i+k]-y[i+k])for k in range(c))for i in range(0,len(x),c)];return{'pixels':sum(v>0 for v in ds),'max':max(ds),'size':[w,h]}
