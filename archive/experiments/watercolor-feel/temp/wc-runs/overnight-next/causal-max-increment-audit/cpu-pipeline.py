"""Real captured raw prefixes ONLY. No source raster approximation.
CPU diagnostic integer transport: parent general common8 floor, nearest canonical
records and bilinear flow sampler; no GPU equivalence claim.
"""
import json,base64,math,sys,pathlib
src=pathlib.Path(sys.argv[1]);d=json.loads(src.read_text());prefix=d['prefixes'];roi=prefix[0]['roi'];w,h=roi['w'],roi['h'];N=w*h
assert len(prefix)==4 and all(p['roi']==roi and p['orientation']=='bottom-up' for p in prefix)
raw=[[list(base64.b64decode(p[k])) for k in ('P','C')] for p in prefix];assert all(len(a)==N*4 for p in raw for a in p)
previous=[[0]*(N*4),[0]*(N*4)];increments=[]
for group in raw:
 inc=[[a-b for a,b in zip(cur,old)] for cur,old in zip(group,previous)]
 if any(v<0 for a in inc for v in a):raise ValueError('Actual raw prefix not monotone; no deltaMAX theorem')
 increments.append(inc);previous=group
assert all(sum(increments[j][k][i] for j in range(4))==raw[-1][k][i] for k in range(2) for i in range(N*4))
def flow(c,x,y):
 f=c['field'];cr=c['rect'];u=(x-cr['x'])/cr['w'];v=(y-cr['y'])/cr['h']
 if not(0<=u<=1 and 0<=v<=1):return(0,0,0)
 # brushDragField top-down y; flow upload maps world top-down rect.
 xx=u*f['width']-.5;yy=v*f['height']-.5;x0=math.floor(xx);y0=math.floor(yy);ax=xx-x0;ay=yy-y0;out=[0.,0.,0.]
 for dx,dy,q in [(0,0,(1-ax)*(1-ay)),(1,0,ax*(1-ay)),(0,1,(1-ax)*ay),(1,1,ax*ay)]:
  ix=min(max(x0+dx,0),f['width']-1);iy=min(max(y0+dy,0),f['height']-1);j=(iy*f['width']+ix)*4
  for k in range(3):out[k]+=q*f['pixels'][j+k]/255
 return(out[0]*2-1,out[1]*2-1,out[2])
def transport(pair,contacts,mask):
 # no measured coverage tape! Restrict source occupancy rawFinal.A>0 as explicit CPU surrogate.
 # This is not production AA coverage or exact GPU oracle.
 steps=0
 for c in contacts:
  hop=max(1,round(c['radius']*.25));
  for _ in range(hop):
   result=[a[:] for a in pair]
   for y in range(h):
    for x in range(w):
     i=(y*w+x)*4
     if not mask[i+3]:continue
     vx,vy,b=flow(c,roi['x']+x+.5,roi['y']+h-y-.5)
     for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
      xx=x+dx;yy=y+dy
      if not(0<=xx<w and 0<=yy<h):continue
      j=(yy*w+xx)*4
      if not mask[j+3]:continue
      _,_,bb=flow(c,roi['x']+xx+.5,roi['y']+h-yy-.5)
      donor=pair[0][i+3];neigh=pair[0][j+3];mix=.02*max(donor-neigh,0)/max(donor,.01275)
      fraction=(.6*max(vx*dx-vy*dy,0)+mix)*min(b,bb)
      limit=1.
      for k in range(2):
       for q in range(4):
        val=pair[k][i+q];room=(255-pair[k][j+q])//4
        if val and fraction>0:limit=min(limit,room/(val*fraction))
      fraction*=limit
      for k in range(2):
       for q in range(4):a=math.floor(pair[k][i+q]*fraction);result[k][i+q]-=a;result[k][j+q]+=a
   assert all(0<=v<=255 for a in result for v in a)
   assert all(sum(a)==sum(b) for a,b in zip(pair,result));pair=result;steps+=1
 return pair,steps
end=0;M=[[0]*(N*4),[0]*(N*4)];clipped=0;steps=0
for n,inc in enumerate(increments):
 added=[[a+b for a,b in zip(old,delta)] for old,delta in zip(M,inc)];clipped+=sum(max(0,v-255) for a in added for v in a);M=[[min(v,255) for v in a] for a in added];newend=prefix[n]['contactEnd'];M,s=transport(M,d['contacts'][end:newend],list(base64.b64decode(prefix[n]['coverage'])));end=newend;steps+=s
report={'actualRawPrefixMonotone':True,'sumDeltaExact':True,'additionalDepositClippedCodes':clipped,'cpuMicrosteps':steps,'finalMovingChannelSums':[[sum(a[q::4]) for q in range(4)] for a in M],'rawFinalChannelSums':[[sum(a[q::4]) for q in range(4)] for a in raw[-1]],'limitations':['CPU finite-volume general integer surrogate not GPU exact; captured coverage currently boolean gate rather than actual smoothstep/midpoint contact','Flow mapping/top-bottom and LINEAR sampling require independent review before interpreting morphology','Contact substep law same R8 nearest count but new general integer floor differs original R8 float transport','No fabricated source: actual four raw prefixes required; reject negative channel delta']}
src.with_name('cpu-pipeline-report.json').write_text(json.dumps(report,indent=2)+'\n')
