"""Select whole overlapping archived strokes; reject samples that need spatial scaling.

Usage: python prepare-m70-gallery-native.py <work>; expects archive-source.json/input.
Image imports and old stroke repeats are excluded; history/Dry are retained.
"""
import json,base64,struct,hashlib,sys
from pathlib import Path
w=Path(sys.argv[1]);a=json.loads((w/'archive-source.json').read_text());cases=[]
for s in a['sheets']:
 p=w/'input'/('ops_'+str(s['id'])+'.json')
 if not p.exists():continue
 ops=json.loads(p.read_text()); strokes=[]
 for o in ops:
  if o['type']!='stroke' or o['timestamp']<1791244800000:continue
  if o.get('dabsPacked'):
   b=base64.b64decode(o['dabsPacked'].split(':',1)[1]);ds=list(struct.iter_unpack('<10f',b))
   bb=[min(d[0]-d[5] for d in ds),min(d[1]-d[5] for d in ds),max(d[0]+d[5] for d in ds),max(d[1]+d[5] for d in ds)]
  else:raise Exception('unpacked input')
  strokes.append((o,bb))
 for st in s['strokes']:
  rect=s['board']['slots'].get(str(st['n']))
  if not rect:continue
  selected=[(o,b) for o,b in strokes if b[0]<rect[2] and b[2]>rect[0] and b[1]<rect[3] and b[3]>rect[1]]
  if not selected:raise Exception(('empty',s['id'],st['n']))
  bounds=[min([rect[0]]+[b[0] for o,b in selected]),min([rect[1]]+[b[1] for o,b in selected]),max([rect[2]]+[b[2] for o,b in selected]),max([rect[3]]+[b[3] for o,b in selected])]
  size=max(bounds[2]-bounds[0],bounds[3]-bounds[1]);
  if size>960:raise Exception(('too large',s['id'],st['n'],size))
  origin=[(bounds[0]+bounds[2]-1024)/2,(bounds[1]+bounds[3]-1024)/2]
  ids={o['id'] for o,b in selected};caseops=[o for o in ops if o['type']!='image_import' and (o['type']!='stroke' or o['id'] in ids)]
  cases.append({'sheet':s['id'],'n':st['n'],'rect':rect,'origin':origin,'bounds':bounds,'ops':caseops,'inputSha':hashlib.sha256(p.read_bytes()).hexdigest()})
(w/'cases.json').write_text(json.dumps(cases));print('cases',len(cases),'maxbounds',max(max(c['bounds'][2]-c['bounds'][0],c['bounds'][3]-c['bounds'][1]) for c in cases))
