import json
r=json.load(open('temp/snapshot/native-boundary-minimal-report.json'));out=[]
def cmp(a,b):
 def tiles(v):return{(t['location'].get('layer'),t['location'].get('x'),t['location'].get('y')):t for t in v['tiles']}
 aa,bb=tiles(a),tiles(b);diff=[];valid=0
 for loc,t in aa.items():
  u=bb.get(loc)
  if not u:diff.append({'loc':loc,'missing':True});continue
  for k in ('coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad'):
   x,y=t.get(k),u.get(k)
   if x is not None and not x.get('outside'):valid+=1
   if x!=y:diff.append({'loc':loc,'field':k,'a':x,'b':y})
 return{'validFieldROIs':valid,'diffs':diff,'clockA':[a['waterUsed'],a['pigmentUsed']],'clockB':[b['waterUsed'],b['pigmentUsed']],'ctxA':a['ctx'],'ctxB':b['ctx']}
clear,pig=r['checks'];ca,cb=[c['boundary']['captures'] for c in clear['captures']];pa,pb=[c['boundary']['captures']for c in pig['captures']]
for gesture in (1,2):
 a=next(c for c in ca if c['label']=='before-finish'and c['owner']=='native'and c['gesture']==gesture)
 b=next(c for c in cb if c['label']=='before-finish'and c['gesture']==gesture)
 out.append({'pair':'donor native vs packed before finish','gesture':gesture,**cmp(a,b)})
for i in range(2):
 a=next(c for c in ca if c['label']=='before-finish'and c['owner']=='native'and c['gesture']==i+1)
 b=[c for c in pb if c['label']=='aux-chunk-after-paint'][i]
 out.append({'pair':'native donor vs reconstructed aux before finish','gesture':i+1,**cmp(a,b)})
for gesture in (1,2):
 a=[c for c in pa if c['label']=='before-finish'and c['owner']!='native'and c['gesture']==gesture][-1]
 b=[c for c in pb if c['label']=='before-finish'and c['owner']=='native'and c['gesture']==gesture][-1]
 out.append({'pair':'pigment packed vs native before finish','gesture':gesture,**cmp(a,b)})
json.dump(out,open('temp/snapshot/native-boundary-stage-comparison.json','w'),indent=2)
for v in out:
 print(v['pair'],v['gesture'],'fields',v['validFieldROIs'],'differences',[(d['loc'],d.get('field'),d.get('a',{}).get('sum')if d.get('a')else None,d.get('b',{}).get('sum')if d.get('b')else None)for d in v['diffs']],'clocks',v['clockA'],v['clockB'])
