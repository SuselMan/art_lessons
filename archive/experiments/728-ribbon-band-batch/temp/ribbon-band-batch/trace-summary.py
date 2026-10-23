import json,collections,statistics
report=[]
for arm in ['off','on']:
 root='temp/ribbon-band-batch/native-'+arm
 r=json.load(open(root+'.json'));p=json.load(open(root+'-cpu.json'));tr=json.load(open(root+'-trace.json'))['traceEvents'];v=r['result']
 marks=[e for e in tr if e.get('name','').startswith('728:')]
 offsets=[e['ts']/1000-e['args']['data']['startTime']for e in marks];offset=statistics.median(offsets)
 nodes={n['id']:n for n in p['nodes']};parents={c:n['id']for n in p['nodes']for c in n.get('children',[])}
 def ancestor(s):
  while s in nodes:
   yield nodes[s]['callFrame'];s=parents.get(s)
 data=[];t=p['startTime']/1000
 for sid,dt in zip(p['samples'],p['timeDeltas']):t+=dt/1000;data.append((t-offset,sid,dt/1000))
 names={(e['pid'],e['tid']):e.get('args',{}).get('name')for e in tr if e.get('name')=='thread_name'}
 windows=[('dense-end',c['t'],c['t']+c['dt'])for c in v['calls']if c['name']=='_onEnd'and c['phase']=='dense-active']
 windows += [('tail-gap',f['t']-f['dt'],f['t'])for f in v['frames']if f['phase']=='settle-tail'and f['dt']>70]
 entry={'arm':arm,'target':r['targetId'],'closed':r['ownTargetClosed'],'scope':'Instrumented independent native gestures; actualuserTiming gives clockoffset, not strictcausalFPS. gpu categories do not cover allViz/compositor waits.','offsetRangeMs':[min(offsets),max(offsets)],'traceEvents':len(tr),'windows':[]}
 for name,lo,hi in windows:
  counter=collections.Counter()
  for t,sid,dt in data:
   if lo<=t<=hi:counter[sid]+=dt
  top=[{'ms':ms,'frame':nodes[sid]['callFrame'],'callers':[x['functionName']for x in list(ancestor(sid))[1:7]]}for sid,ms in counter.most_common(10)]
  xevents=sorted((e for e in tr if e.get('ph')=='X'and e.get('ts',0)/1000-offset<hi and (e.get('ts',0)+e.get('dur',0))/1000-offset>lo),key=lambda x:-x.get('dur',0))
  longest=[{'name':e['name'],'ms':e.get('dur',0)/1000,'t':e['ts']/1000-offset,'thread':names.get((e['pid'],e['tid']))}for e in xevents[:10]]
  entry['windows'].append({'name':name,'start':lo,'end':hi,'cpuTop':top,'traceLongest':longest})
 report.append(entry)
json.dump(report,open('temp/ribbon-band-batch/trace-summary.json','w'),indent=2)
for e in report:
 print(e['arm'],'offset',e['offsetRangeMs'])
 for w in e['windows']:print(w['name'],[(round(x['ms'],1),x['frame']['functionName'])for x in w['cpuTop']],w['traceLongest'][:2])
