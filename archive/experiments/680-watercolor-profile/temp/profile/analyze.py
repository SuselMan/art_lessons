import json,sys,collections
from pathlib import Path
for file in Path(sys.argv[1]).glob('*.cpuprofile'):
 p=json.loads(file.read_text());nodes={x['id']:x for x in p['nodes']};parents={c:n['id'] for n in p['nodes'] for c in n.get('children',[])};selfms=collections.Counter();inclusive=collections.Counter();calls=collections.Counter()
 for ident,delta in zip(p.get('samples',[]),p.get('timeDeltas',[])):
  t=delta/1000;selfms[ident]+=t;walk=ident
  while walk in nodes:
   inclusive[walk]+=t
   if walk not in parents:break
   walk=parents[walk]
  parent=parents.get(ident)
  if parent in nodes:calls[(nodes[ident]['callFrame']['functionName'],nodes[parent]['callFrame']['functionName'])]+=t
 def row(i,t):
  f=nodes[i]['callFrame'];return {'function':f['functionName'],'url':f['url'],'line':f['lineNumber']+1,'ms':round(t,3),'selfMs':round(selfms[i],3)}
 result={'file':file.name,'sampleMs':sum(selfms.values()),'samples':len(p.get('samples',[])),'topSelf':[row(i,t) for i,t in selfms.most_common(35)],'topInclusive':[row(i,t) for i,t in inclusive.most_common(35)],'callers':[{'function':a,'caller':b,'ms':round(t,3)} for (a,b),t in calls.most_common(35)]}
 file.with_suffix('.summary.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
