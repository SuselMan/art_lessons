import base64, json, math, struct
from pathlib import Path

root=Path(__file__).parent
case=next(c for c in json.loads((root/'inputs.json').read_text())['cases'] if c['id']=='s6-n6')
anchor=None; kept=[]; raw=[]; chunks=[]
for op in case['ops']:
    assert op.get('wet') is None and op.get('wetProfile') is None
    payload=base64.b64decode(op['dabsPacked'].split(':',1)[1])
    ds=[dict(zip(['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t'], row)) for row in struct.iter_unpack('<10f',payload)]
    k=0
    for d in ds:
        raw.append(d.copy()); d['size']=max(d['size'],1.5)
        minor=d['size']/2
        q=max(1.5,minor*.06)
        if anchor is not None and math.hypot(d['x']-anchor['x'], d['y']-anchor['y']) < q: continue
        kept.append(d); anchor=d; k+=1
    chunks.append({'seq':op['seq'],'raw':len(ds),'kept':k})
used=0; travel=0; contributions=[]; previous=None
for i,d in enumerate(kept):
    b=d['size']/2; a=b*max(d['aspectRatio'],1)
    dx=d['x']-previous['x'] if previous else 0
    dy=d['y']-previous['y'] if previous else 0
    dist=math.hypot(dx,dy)
    angle=math.atan2(dy,dx) if dist>.01 else None
    radius=math.sqrt(a*b) if angle is None else a*b/math.hypot(a*math.sin(d['angle']-angle),b*math.cos(d['angle']-angle))
    radius=max(radius,.5)
    seg=radius*.5 if previous is None else dist if dist>.01 else radius*.12
    step=seg/max(radius,.5)
    used+=step; travel+=dist
    contributions.append({'index':i,'pressure':d['pressure'],'minor':b,'travelRadius':radius,'distance':dist,'step':step,'used':used,'load20':.04+.96*math.exp(-used/20),'load60':.04+.96*math.exp(-used/60)})
    previous=d
def stats(values):
    v=sorted(values)
    return {'min':v[0],'median':v[len(v)//2],'p90':v[int(len(v)*.9)],'max':v[-1]}
def bucket(pred):
    cs=[x for x in contributions if pred(x)]
    return {'count':len(cs),'stepSum':sum(x['step'] for x in cs),'fractionOfClock':sum(x['step'] for x in cs)/used,'distancePx':sum(x['distance'] for x in cs)}
out={'case':case['id'],'assumptions':'Exact recorded float32 dabs; watercolor sizeMultiplier1, minHalfWidth.75, travel quantum max1.5/.06minor; lastKept and used carried across same strokeId chunks; missing wet profile -> wetAt0, so no pickup. No pressure resampling invented.',
     'chunks':chunks,'rawDabs':len(raw),'keptDabs':len(kept),'skippedDabs':len(raw)-len(kept),'totalTravelPx':travel,'totalUsedRadii':used,'finalLoad20':contributions[-1]['load20'],'finalLoad60':contributions[-1]['load60'],
     'rawPressure':stats([d['pressure'] for d in raw]),'keptMinorRadius':stats([d['minor'] for d in contributions]),'keptTravelRadius':stats([d['travelRadius'] for d in contributions]),
     'firstDabCharge':contributions[0]['step'],'stationaryKept':bucket(lambda x:x['index']>0 and x['distance']<=.01),'minorBelow2':bucket(lambda x:x['minor']<2),'pressureBelowPoint1':bucket(lambda x:x['pressure']<.1),'pressureBelowPoint3':bucket(lambda x:x['pressure']<.3),
     'clockThresholds':[{ 'threshold':t, 'firstKeptIndex':next((x['index'] for x in contributions if x['used']>=t),None)} for t in [20,40,60,80,100]],
     'conclusion':'Stationary dabs cannot consume creep after quantum filtering except initial.5radius charge. Small-pressure/radius contribution and final used must be read numerically rather than inferred from visual tail.'}
(root/'water-clock-audit.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
