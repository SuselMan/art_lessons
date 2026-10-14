import json,base64
from pathlib import Path
p=Path(__file__).parent;rows=[]
for f in sorted(p.glob('*.json')):
 if '.pixels.' in f.name or f.name.startswith('summary'):continue
 try:d=json.loads(f.read_text())
 except:continue
 if not isinstance(d,dict) or 'dryMs' not in d:continue
 r={'file':f.name,**{k:d.get(k) for k in ['model','renderer','dryMs','inputMs','wholeWorkMs','stats','gl','lost','errors','tileHashes','mrt']}}
 r['counts']={k:v for k,v in d.get('counts',{}).items() if k!='fields'}
 r['fieldDimensions']=sorted(set(tuple(x[z] for z in ['w','h','scale']) for x in d.get('counts',{}).get('fields',[])))
 rows.append(r)
(p/'summary.json').write_text(json.dumps(rows,indent=2))
print('summarized',len(rows))
