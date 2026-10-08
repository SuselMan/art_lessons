"""Match actual queued CPU stamps against explicit offline anchor candidates.
No substitute for GPU shader/channel parity; report mismatches without tuning."""
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]);report=json.loads((root/'report.json').read_text());census=report.get('preparedCensus') or report.get('failurePreparedCensus') or [];candidates=json.loads(pathlib.Path(sys.argv[2]).read_text());matches=[];actual=[]
def diff(a,b,path=''):
 if isinstance(a,dict) and isinstance(b,dict):
  out=[]
  for k in sorted(set(a)|set(b)):
   if k not in a or k not in b:out.append({'path':path+'/'+k,'actual':a.get(k),'candidate':b.get(k)})
   else:out+=diff(a[k],b[k],path+'/'+k)
  return out
 if isinstance(a,list) and isinstance(b,list):
  if len(a)!=len(b):return[{'path':path,'actualLength':len(a),'candidateLength':len(b)}]
  return sum((diff(x,y,path+'/'+str(i)) for i,(x,y) in enumerate(zip(a,b))),[])
 return [] if a==b else [{'path':path,'actual':a,'candidate':b}]
for i,item in enumerate(census):
 commands=[c for c in item['commands'] if c['kind']=='stamp'];tests=[]
 for candidate in candidates[i*2:i*2+2]:
  proposed=[c for c in candidate['commands'] if c['kind']=='stamp'];tests.append({'anchoring':candidate['anchoring'],'differences':diff(commands,proposed)})
 matches.append({'contact':i,'actualRecipe':item.get('actualRecipe'),'film':item['film'],'tests':tests})
 actual.append({'contact':i,'scope':'Actual queued prepared CPU commands; not post-GPU uniform bit capture','commands':commands})
(root/'prepared-census-match.json').write_text(json.dumps(matches,indent=2));(root/'actual-held-prepared.json').write_text(json.dumps(actual,indent=2));print(json.dumps(matches))
