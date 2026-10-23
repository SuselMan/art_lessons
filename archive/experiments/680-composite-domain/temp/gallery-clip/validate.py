import json,hashlib
from pathlib import Path
from PIL import Image
p=Path(__file__).parent;a=json.loads((p/'preview-stage/archive.json').read_text());old=json.loads((p/'archive-source.json').read_text());version='1e49aa99-clip';m=json.loads((p/'manifest.json').read_text());report=[]
assert m['totalSlots']==76 and len(m['sheets'])==10
assert [v for v in a['versions'] if v['id']!=version]==old['versions']
stripped=json.loads(json.dumps(a));stripped['versions']=old['versions']
for s in stripped['sheets']:
 for st in s['strokes']:st.get('app',{}).pop(version,None)
assert stripped==old,'historical archive metadata changed'
for s in a['sheets']:
 for st in s['strokes']:
  frame=st.get('app',{}).get(version)
  if not frame:continue
  file=p/'preview-stage'/frame['src'];im=Image.open(file);im.load();assert list(im.size)==[frame['w'],frame['h']]
  prev=st['app']['c1997fee-review'];assert [frame['w'],frame['h']]==[prev['w'],prev['h']]
  report.append({'sheet':s['id'],'n':st['n'],'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'w':im.width,'h':im.height})
assert len(report)==76
(p/'validation.json').write_text(json.dumps({'version':version,'totalSlots':76,'historyExact':True,'images':report},indent=2)+'\n');print('PASS76 slots, all dimensions/history exact')
