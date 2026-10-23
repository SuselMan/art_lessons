import json,base64,struct,math
from pathlib import Path
r=Path(__file__).parent; inp=json.load(open(r.parent/'inputs.json')); audits=[]
for cid,n in [('s6-n6',16),('s9-n3',32)]:
 c=next(c for c in inp['cases'] if c['id']==cid);raw=[list(d) for o in c['ops'] for d in struct.iter_unpack('<10f',base64.b64decode(o['dabsPacked'].split(':')[1]))];groups=[];start=0;dist=0;prev=None
 for i,d in enumerate(raw):
  if prev:dist+=math.hypot(d[0]-prev[0],d[1]-prev[1])
  prev=d
  if dist>=max(1,d[5]*.5)*2:
   groups.append({'lo':start,'hi':i+1,'travel':dist});start=i+1;dist=0
   if len(groups)==n:break
 ds=raw[:groups[-1]['hi']];boxes=[]
 for d in ds:
  a=d[5]*.5*max(1,d[6]);b=d[5]*.5;co=abs(math.cos(d[7]));si=abs(math.sin(d[7]));ex=a*co+b*si;ey=a*si+b*co;boxes.append([d[0]-ex,d[1]-ey,d[0]+ex,d[1]+ey])
 bb=[min(v[0]for v in boxes),min(v[1]for v in boxes),max(v[2]for v in boxes),max(v[3]for v in boxes)];span=[bb[2]-bb[0],bb[3]-bb[1]];radius=max(d[5]*.5*max(1,d[6]) for d in ds);pad=177+max(2,min(10,round(radius/5)))+2+math.ceil(radius)+2
 interim=[x+68 for x in span];final=[min(1024,x+64+2*pad)for x in span]
 audits.append(dict(case=cid,prefixCount=len(ds),groups=groups,translation=[512-(bb[0]+bb[2])/2,512-(bb[1]+bb[3])/2],nibSpan=span,interimConservativeBound=interim,finalTileClippedBound=final,finalPad=pad,maxLongRadius=radius,interimGuardPass=max(interim)<=512,finalGuardPass=max(final)<=1024,existingFieldMiB=90,newTextureCount=0,canonicalClearUpperGiB=n*5*1536**2*4/1024**3,sourceChanges='none; translated original float32 input only',warning='bounds conservative; actual reachBounds/frontReach authoritative; contacts must be measured from actual kept painter, not raw dabs'))
(r/'geometry.json').write_text(json.dumps(audits,indent=2));print(json.dumps([{k:v for k,v in a.items()if k!='groups'}for a in audits],indent=2))
