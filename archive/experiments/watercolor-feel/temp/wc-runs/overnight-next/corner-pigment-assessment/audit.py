"""Path-relative final pigment measurements, no photo-based synthetic score."""
import base64,json,sys
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parents[1]
case=next(c for c in json.loads((root/'inputs.json').read_text())['cases'] if c['id']=='s6-n6')
raw=np.concatenate([np.frombuffer(base64.b64decode(o['dabsPacked'].split(':',1)[1]),dtype='<f4').reshape(-1,10) for o in case['ops']])
# Resample only for locating substantial path turns. Actual paint is never rebuilt here.
kept=[0]
for i in range(1,len(raw)):
    if np.linalg.norm(raw[i,:2]-raw[kept[-1],:2])>=max(2.,raw[i,5]*.15):kept.append(i)
poses=raw[kept]; edges=np.diff(poses[:,:2],axis=0); dirs=edges/np.maximum(np.linalg.norm(edges,axis=1)[:,None],1e-9)
angles=np.arccos(np.clip(np.sum(dirs[:-1]*dirs[1:],axis=1),-1,1)); selected=[]
for j in np.argsort(-angles):
    if angles[j]<.9:continue
    i=kept[j+1]
    if all(np.linalg.norm(raw[i,:2]-raw[k,:2])>max(raw[i,5],raw[k,5])*.5 for k in selected):selected.append(i)
selected=sorted(selected)
events=[('start',0)]+[(f'turn-{n+1}',i)for n,i in enumerate(selected)]
result={'case':case['id'],'scope':'Final physical encoded P.A near original recorded start and geometrically detected turns, not photo alignment or GPU source mass. Overlapping later passes contribute; does not attribute pigment to individual events.','detector':'spatially sample >= max(2px,.15*size); angle>=.9rad; suppress within .5*max(size); disk radius .2*recorded size','variants':[]}
for folder in sys.argv[1:]:
    p=Path(folder); tiles={}
    for f in p.glob(case['id']+'-*-u_inkLoad.rgba'):
        origin=tuple(map(int,f.name.split('-')[2].split('_')))
        tiles[origin]=np.flipud(np.frombuffer(f.read_bytes(),dtype=np.uint8).reshape(1024,1024,4))
    if not tiles:
        result['variants'].append({'folder':str(p),'status':'NOT_MEASURED: no final tile inkLoad captures'})
        continue
    rows=[]
    for name,i in events:
        x,y=map(float,raw[i,:2]); radius=max(2.,float(raw[i,5])*.2)
        values=[]
        for yy in range(int(y-radius),int(y+radius)+1):
            for xx in range(int(x-radius),int(x+radius)+1):
                if (xx+.5-x)**2+(yy+.5-y)**2>radius**2:continue
                ox,oy=xx//1024*1024,yy//1024*1024
                a=tiles.get((ox,oy))
                values.append(int(a[yy-oy,xx-ox,3])if a is not None else 0)
        rows.append({'event':name,'dabIndex':i,'world':[x,y],'radius':radius,'samples':len(values),'meanEncodedA':float(np.mean(values)),'p90EncodedA':float(np.percentile(values,90)),'maxEncodedA':max(values)})
    turns=[r['meanEncodedA'] for r in rows[1:]]
    result['variants'].append({'folder':str(p),'events':rows,'startToMeanTurn':rows[0]['meanEncodedA']/max(float(np.mean(turns)),1e-9)if turns else None,'turnCoefficientVariation':float(np.std(turns))/max(float(np.mean(turns)),1e-9)if turns else None})
(Path(__file__).parent/'last-assessment.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'turnsDetected':len(selected),'variants':[{k:v for k,v in r.items()if k!='events'}for r in result['variants']]},indent=2))
