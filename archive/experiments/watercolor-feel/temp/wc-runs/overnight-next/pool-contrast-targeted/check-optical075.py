from pathlib import Path
import json,hashlib
n=Path(__file__).resolve().parent.parent;d=Path(__file__).parent;f=n/'optical-gain075-primary-two';parent=n/'saturating-beer-softshoulder16-four';r=json.load(open(f/'report.json'));spec=json.load(open(d/'optical-gain075.json'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert r['complete']and not r['errors'];assert r['experimentSha256']==sha(d/'optical-gain075.json');rows=[]
for c in r['cases']:
 id=c['id'];assert c['error']==0 and not c['lost'];assert sha(f/(id+'.png'))==c['pngSha256'];assert max(c['brushUnitBudget'],default=0)<1000
 for i,p in enumerate(spec['runtimePatches']):assert c['customReplacements'][i]>0 if p['kind']=='shader-exact'else r['modulePatchCounts'][i]>0
 fa=json.load(open(f/(id+'-composite-fields.json')));fb=json.load(open(parent/(id+'-composite-fields.json')));keys=[k for k in fa if k.endswith(('-u_inkLoad','-u_inkColor','-u_strokeCoverage'))];assert set(keys)=={k for k in fb if k.endswith(('-u_inkLoad','-u_inkColor','-u_strokeCoverage'))}
 for k in keys:assert sha(f/(id+'-'+k+'.rgba'))==sha(parent/(id+'-'+k+'.rgba'))
 rows.append({'id':id,'physicalSamplersByteExact':True,'samplerCount':len(keys),'unitMaxMs':max(c['brushUnitBudget'],default=0)})
(d/'optical075-final-qc.json').write_text(json.dumps({'pass':True,'report':str(f/'report.json'),'variant':r['variant'],'specSHA':r['experimentSha256'],'cases':rows},indent=2));print(rows)
