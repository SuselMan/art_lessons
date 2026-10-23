import json,base64,math,pathlib,sys,hashlib
src=pathlib.Path(sys.argv[1]);data=json.loads(src.read_text());prefix=data['prefixes'];roi=prefix[0]['roi'];w,h=roi['w'],roi['h'];N=w*h;raw=[[list(base64.b64decode(p[k])) for k in ('P','C')] for p in prefix];cov=[list(base64.b64decode(p['coverage'])) for p in prefix];prev=[[0]*(N*4) for _ in range(2)];inc=[]
assert len(prefix)==4 and len(data['contacts'])==15 and all(p['roi']==roi and p['orientation']=='bottom-up' for p in prefix)
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
 cache.append((edges,max(1,round(c['radius']*.25))))
def transport(pair,start,end,coverage):
 stats=[]
 for ci in range(start,end):
  edges,hop=cache[ci];active=[(i,j,v,b*smooth(min(coverage[i*4+3],coverage[j*4+3])/255)) for i,j,mid,v,b in edges if coverage[mid*4+3]/255>=.015];pre=sums(pair);moved=0
  for _ in range(hop):
   result=[a[:] for a in pair]
   for i,j,v,bcontact in active:
    ia=i*4;ja=j*4;donor=pair[0][ia+3];neigh=pair[0][ja+3];fraction=(.6*v+.02*max(donor-neigh,0)/max(donor,.01275))*bcontact
    if fraction<=0:continue
    limit=1.
    for k in range(2):
     for q in range(4):
      value=pair[k][ia+q];room=(255-pair[k][ja+q])//4
      if value:limit=min(limit,room/(value*fraction))
    fraction*=limit
    for k in range(2):
     for q in range(4):a=math.floor(pair[k][ia+q]*fraction+1e-12);result[k][ia+q]-=a;result[k][ja+q]+=a;moved+=a if k==0 and q==3 else 0
   assert all(0<=v<=255 for a in result for v in a);assert sums(result)==sums(pair);pair=result
  stats.append({'contact':ci,'hop':hop,'movedCarrierCodes':moved,'channelSumsBefore':pre,'channelSumsAfter':sums(pair)})
 return pair,stats
results={};outputs={}
for mode in ['trueIncrement','wholePrefixRefill','finalSourceFirst']:
 M=[[0]*(N*4) for _ in range(2)] if mode!='finalSourceFirst' else [a[:] for a in raw[-1]];end=0;stages=[];transportstats=[]
 for n in range(4):
  before=sums(M)
  if mode=='trueIncrement':unclipped=[[a+b for a,b in zip(M[k],inc[n][k])] for k in range(2)]
  elif mode=='wholePrefixRefill':unclipped=[[max(a,b) for a,b in zip(M[k],raw[n][k])] for k in range(2)]
  else:unclipped=M
  clipping=[sum(max(v-255,0) for v in a) for a in unclipped];M=[[min(v,255) for v in a] for a in unclipped];deposited=sums(M);newend=prefix[n]['contactEnd'];M,ts=transport(M,end,newend,cov[-1] if mode=='finalSourceFirst' else cov[n]);end=newend;transportstats+=ts
  stages.append({'prefix':n,'beforeDepositSums':before,'afterDepositSums':deposited,'clippedCodesPC':clipping,'afterTransportSums':sums(M)})
 results[mode]={'stages':stages,'transport':transportstats,'finalSums':sums(M)};outputs[mode]=M
 for k,name in enumerate(['P','C']):src.with_name('cpu-v2-'+mode+'-'+name+'.rgba').write_bytes(bytes(M[k]))
report={'captureSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'roi':roi,'sourceMonotone':True,'sumDeltaExactlyFinalRaw':True,'rawPrefixes':[{'group':n,'sums':sums(p),'PBAEqual':p[0][2::4]==p[0][3::4],'PCAlphaEqual':p[0][3::4]==p[1][3::4]} for n,p in enumerate(raw)],'models':results,'differences':{},'limits':['CPU DOUBLE not WebGL float32; nearest midpoint tie chooses floor UV cell, device boundary tie may differ','General common8 integer floor model differs captured R8 FLOAT transport, intentionally same across three CPU models','No wholepixel outside-scissor pairing: discarded cross-scissor edges explicitly; actual flow hardzero should make them zero except positive CLAMP border issue','wholePrefixRefill=max(M,S_prefix) is control, NOT exact R7 max(M,newGroupStamp); raw prefixes do not reveal hidden sub-max new stamp doses','finalSourceFirst uses final coverage throughout, causal models actual cumulative per-prefix coverage; chronology changes receiving-domain availability as well as source timing','No photo/fullstroke claims; fourprefix only, no front/diffusion/final optics']}
for mode in ['wholePrefixRefill','finalSourceFirst']:
 a=outputs['trueIncrement'][0];b=outputs[mode][0];report['differences'][mode]={'MAEcodes':sum(abs(x-y) for x,y in zip(a,b))/len(a),'maxCode':max(abs(x-y) for x,y in zip(a,b)),'differentCells':sum(any(a[i+q]!=b[i+q] for q in range(4)) for i in range(0,len(a),4))}
src.with_name('cpu-pipeline-v2-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'rawFinalSums':sums(raw[-1]),'modelFinalSums':{k:v['finalSums'] for k,v in results.items()},'differences':report['differences']},indent=2))
