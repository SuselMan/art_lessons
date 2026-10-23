import json,collections
from pathlib import Path
p=json.loads(Path('temp/display-observer/results/report.json').read_text());events=p['events'];counts=collections.Counter();examples=[]
for x in events:
 if x['kind']=='_composePaperToScreen:enter':counts[('active' if x['stroke'] else 'up')+(':partial' if x.get('argPartial') else ':full')]+=1
 if x['kind']=='_displayIfNotSuspended:enter' and x['stroke']:
  counts['activeRequests']+=1
  if 'setTimeout' in (x.get('stack') or '') or 'index.ts:' in (x.get('stack') or ''):
   examples.append(x)
 if x['kind']=='_display:enter' and x['pendingRAF'] is not None:counts['displayWithPendingRAF']+=1
print(json.dumps({'counts':dict(counts),'capReached':p['capReached'],'frameStats':p['native']['frameStats'],'activeRequestExamples':examples[:8],'attrs':p.get('attrs')},indent=2))
