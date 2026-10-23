from pathlib import Path
import json,math,base64,struct
r=Path(__file__).parent;parent=r.parent/'physical22-actual-water-contact';inp=json.load(open(r.parent/'inputs.json'));c=next(c for c in inp['cases']if c['id']=='s9-n3');box=c['box']; print(box)
tiles={}
for f in parent.glob('s9-n3-*-u_strokeCoverage.rgba'):
 parts=f.name.split('-')[2].split('_');tiles[tuple(map(int,parts))]=f.read_bytes()
# File stems are s9-n3-1024_0-u..., tile data bottom-up 1024.
def rgba(x,y,name='coverage'):
 ox=x//1024*1024;oy=y//1024*1024;b=tiles.get((ox,oy))
 if not b:return [0]*4
 i=((1023-(y-oy))*1024+x-ox)*4;return b[i:i+4]
points={};total=(box[2]-box[0])*(box[3]-box[1]); rows=[]
for t in [1,16,64,128,240]:
 p=[(x,y)for y in range(box[1],box[3])for x in range(box[0],box[2])if rgba(x,y)[3]>=t]
 if not p:continue
 bb=[min(x for x,y in p),min(y for x,y in p),max(x for x,y in p)+1,max(y for x,y in p)+1];mx=sum(x for x,y in p)/len(p);my=sum(y for x,y in p)/len(p);xx=sum((x-mx)**2 for x,y in p)/len(p);yy=sum((y-my)**2 for x,y in p)/len(p);xy=sum((x-mx)*(y-my)for x,y in p)/len(p);det=xx*yy-xy*xy
 areaEllipse=4*math.pi*math.sqrt(det)
 rows.append(dict(alphaThreshold=t,pixels=len(p),bounds=bb,ellipseCovarianceArea=areaEllipse,areaToCovarianceEllipse=len(p)/areaEllipse,standingZero=sum(rgba(x,y)[2]==0 for x,y in p)))
raw=[d for o in c['ops']for d in struct.iter_unpack('<10f',base64.b64decode(o['dabsPacked'].split(':')[1]))]
report=dict(case=c['id'],rawDabs=len(raw),sourceFieldFolder=str(parent),coverageSameSourceLaw='Actual-water contact modifies only brushTravel.water; coverage source and transport unchanged. This field therefore diagnoses physical22 support, not a source mutation.',crop=box,rows=rows,scope='Raw bottom-up recorded tile coverage sampled in original world crop, no threshold/photo fit.',conclusion='A compact near-ellipse is already encoded in coverage. Brush flux endpoints are bounded inside each sweptcontact; final coverage cannot be deformed by that pigment-only conservative brushpass.')
(r/'support-numbers.json').write_text(json.dumps(report,indent=2));print(json.dumps(rows,indent=2))
