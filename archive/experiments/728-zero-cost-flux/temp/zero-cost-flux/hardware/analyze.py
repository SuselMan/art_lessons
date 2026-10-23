import json,gzip,pathlib,collections
p=pathlib.Path(__file__).parent/'results-adreno-vps-old-off-on';r=json.loads((p/'report.json').read_text());w=h=1536
load=lambda row:gzip.decompress((p/row['file']).read_bytes())
initial=load(r['checkpointInputRecords'][str(r['checkpointState']['inputs']['P'])]);off=load(r['arms'][1]['records']['P']);on=load(r['arms'][2]['records']['P'])
meta=json.loads((p/'actual-field-metadata.json').read_text());record=meta['planes'][0]['records'][0];x0,y0,rw,rh=record['read'];assert record['buffer']==[w,h]
roi=lambda raw:bytes(raw[((y0+y)*w+x0)*4:((y0+y)*w+x0+rw)*4] for y in [])
def extract(raw):return b''.join(raw[((y0+y)*w+x0)*4:((y0+y)*w+x0+rw)*4] for y in range(rh))
seed=extract(initial);a=extract(off);b=extract(on);n=rw*rh;m=[seed[4*i+3]>0 for i in range(n)];distance=[n]*n;q=collections.deque()
def neighbours(i):
 x,y=i%rw,i//rw
 return [j for j in [i-1 if x else -1,i+1 if x+1<rw else -1,i-rw if y else -1,i+rw if y+1<rh else -1]if j>=0]
for i in range(n):
 if any(m[j]!=m[i]for j in neighbours(i)):distance[i]=0;q.append(i)
while q:
 i=q.popleft()
 for j in neighbours(i):
  if distance[j]>distance[i]+1:distance[j]=distance[i]+1;q.append(j)
distance=[-distance[i]-1 if m[i]else distance[i]for i in range(n)]
profile={}
for k in[-10,-5,-2,-1,0,1,2,5,10]:
 ix=[i for i in range(n)if distance[i]==k];profile[k]={'count':len(ix),'OFF':sum(a[4*i+2]for i in ix)/len(ix),'ON':sum(b[4*i+2]for i in ix)/len(ix)}
changes=0;maxdiff=0;box=[w,h,-1,-1];channels=[0]*4;maxchannels=[0]*4
for i in range(w*h):
 values=[abs(off[4*i+k]-on[4*i+k])for k in range(4)]
 if any(values):changes+=1;box[0]=min(box[0],i%w);box[1]=min(box[1],i//w);box[2]=max(box[2],i%w);box[3]=max(box[3],i//w)
 for k,d in enumerate(values):channels[k]+=d>0;maxchannels[k]=max(maxchannels[k],d)
 maxdiff=max(maxdiff,*values)
base=r['checkpointInputRecords'][str(r['checkpointState']['inputs']['P'])]['sum'];old=r['arms'][1]['records']['P']['sum'];new=r['arms'][2]['records']['P']['sum']
out={'scope':'full1536 carry checkpoint; signed ink-support distance profile in actualROI354x266, not composite ring visibility','profileROI':profile,'fullChangedPixels':changes,'fullMaxChannelDiff':maxdiff,'glBBox':box,'changedPerChannel':channels,'maxPerChannel':maxchannels,'mass':{'initial':base,'OFF':old,'ON':new,'OFFLossPercent':[(base[k]-old[k])/base[k]*100 for k in range(4)],'ONLossPercent':[(base[k]-new[k])/base[k]*100 for k in range(4)],'additionalLossPercent':[(old[k]-new[k])/base[k]*100 for k in range(4)]},'negativeValuesImpossibleUNORM':'positivity proof CPU; this byte readback alone cannot prove absence of shader clamp','outsideInitialInkROIMass':{'OFF':sum(a[4*i+2]for i in range(n)if not m[i]),'ON':sum(b[4*i+2]for i in range(n)if not m[i])}}
(p/'offline-zero-face-analysis.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,ensure_ascii=False))
# Scientific density panels: OFF / ON / signed ON-OFF, not a painted composite.
import struct,zlib
panel=rw+8;cw=panel*3;ch=rh
pixels=bytearray(cw*ch*3)
for y in range(ch):
 for x in range(cw):
  k=x//panel;px=x%panel;v=(255,255,255)
  if px<rw:
   i=((rh-1-y)*rw+px)*4;aa=a[i+2];bb=b[i+2]
   if k<2:
    t=255-(aa if k==0 else bb);v=(t,t,t)
   else:
    d=bb-aa;t=min(255,abs(d)*32);v=(255,255-t,255-t)if d<0 else(255-t,255-t,255)
  j=(y*cw+x)*3;pixels[j:j+3]=bytes(v)
def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
raw=b''.join(b'\0'+pixels[y*cw*3:(y+1)*cw*3]for y in range(ch))
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',cw,ch,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
(p/'density-OFF-ON-signeddiff.png').write_bytes(png)
