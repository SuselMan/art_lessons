import json,base64,math,pathlib,sys,hashlib
src=pathlib.Path(sys.argv[1]);data=json.loads(src.read_text());prefix=data['prefixes'];roi=prefix[0]['roi'];w,h=roi['w'],roi['h'];N=w*h;raw=[[list(base64.b64decode(p[k])) for k in ('P','C')] for p in prefix];cov=[list(base64.b64decode(p['coverage'])) for p in prefix];prev=[[0]*(N*4) for _ in range(2)];inc=[]
assert len(prefix)==4 and 1<=len(data['contacts'])<=64 and all(p['roi']==roi and p['orientation']=='bottom-up' for p in prefix)
for p in raw:
 delta=[[a-b for a,b in zip(a,b)] for a,b in zip(p,prev)];assert all(v>=0 for a in delta for v in a),'nonmonotoneactualraw';inc.append(delta);prev=p
assert all(sum(d[k][i] for d in inc)==raw[-1][k][i] for k in range(2) for i in range(N*4))
def sums(pair):return [[sum(a[q::4]) for q in range(4)] for a in pair]
def flow(c,x,y):
 f=c['field'];r=c['rect'];u=(roi['x']+x+.5-r['x'])/r['w'];v=(r['y']+r['h']-(roi['y']+h-y-.5))/r['h']
 if not(0<=u<=1 and 0<=v<=1):return(0.,0.,0.)
 xx=u*f['width']-.5;yy=v*f['height']-.5;ix=math.floor(xx);iy=math.floor(yy);ax=xx-ix;ay=yy-iy;out=[0.,0.,0.]
 for dx,dy,q in [(0,0,(1-ax)*(1-ay)),(1,0,ax*(1-ay)),(0,1,(1-ax)*ay),(1,1,ax*ay)]:
  j=(min(max(iy+dy,0),f['height']-1)*f['width']+min(max(ix+dx,0),f['width']-1))*4
  for k in range(3):out[k]+=q*f['pixels'][j+k]/255
 return(out[0]*2-1,out[1]*2-1,out[2])
def smooth(x):t=max(0,min(1,(x-.015)/.135));return t*t*(3-2*t)
# Precache realcontact B/RG + canonical endpoints and coverage nearest midpoint.
cache=[]
for c in data['contacts']:
 flows=[flow(c,x,y) for y in range(h) for x in range(w)];edges=[]
 r=c['rect'];lo=max(0,math.floor(r['x']-roi['x']));hi=min(w,math.ceil(r['x']+r['w']-roi['x']));bottom=max(0,math.floor(roi['y']+h-(r['y']+r['h'])));top=min(h,math.ceil(roi['y']+h-r['y']))
 for y in range(bottom,top):
  for x in range(lo,hi):
   i=y*w+x;vx,vy,B=flows[i]
   for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
    xx=x+dx;yy=y+dy
    if not(0<=xx<w and 0<=yy<h):continue
    # Both recipients inside scissor required. Otherwise pair accounting cannot match GPU outside copyback.
    if not(lo<=xx<hi and bottom<=yy<top):continue
    j=yy*w+xx;midx=math.floor(x+.5+dx*.5);midy=math.floor(y+.5+dy*.5);mid=midy*w+midx
    edges.append((i,j,mid,max(vx*dx+vy*dy,0),min(B,flows[j][2])))
 zmax=max(-math.log(max(1-c['field']['pixels'][i]/255,1/255)) for i in range(2,len(c['field']['pixels']),4));hop=max(1,math.ceil(.8*c['radius']*zmax*math.sqrt(2)/.84));baseH=max(1,math.ceil(.2*c['radius']*zmax*math.sqrt(2)/.84));assert hop<=64;cache.append((edges,hop,.8*c['radius']/hop,.02*baseH/hop))
def transport(pair,start,end,coverage):
 global phaseTick
 stats=[]
 for ci in range(start,end):
  edges,hop,gain,contactMix=cache[ci];active=[(i,j,v,b,smooth(min(coverage[i*4+3],coverage[j*4+3])/255)) for i,j,mid,v,b in edges if coverage[mid*4+3]/255>=.015];pre=sums(pair);moved=0
  for _ in range(hop):
   result=[a[:] for a in pair];cumulative={};tick=phaseTick;phaseTick+=1
   for i,j,v,doseB,contact in active:
    ia=i*4;ja=j*4;donor=pair[0][ia+3];neigh=pair[0][ja+3];fraction=(gain*v*(-math.log(max(1-doseB,1/255)))+contactMix*max(donor-neigh,0)/max(donor,.01275)*doseB)*contact
    if fraction<=0:continue
    limit=1.
    for k in range(2):
     for q in range(4):
      value=pair[k][ia+q];room=(511-pair[k][ja+q])//4
      if value:limit=min(limit,room/(value*fraction))
    fraction*=limit
    previous=cumulative.get(i,0.);following=previous+fraction;cumulative[i]=following
    worldx=i%w+roi['x'];worldy=i//w-roi['y']-h;xi=((worldx%251*73+worldy%251*109+tick%251*137)%251+.5)/251
    for k in range(2):
     for q in range(4):
      a=math.floor(pair[k][ia+q]*following+xi)-math.floor(pair[k][ia+q]*previous+xi);a=min(a,(511-pair[k][ja+q])//4);result[k][ia+q]-=a;result[k][ja+q]+=a;moved+=a if k==0 and q==3 else 0
   assert all(0<=v<=511 for a in result for v in a);assert sums(result)==sums(pair);pair=result
  stats.append({'contact':ci,'hop':hop,'movedCarrierCodes':moved,'channelSumsBefore':pre,'channelSumsAfter':sums(pair)})
 return pair,stats
