import json,collections
r=json.load(open('temp/lazy-contacts/attribution-report.json'));p=json.load(open('temp/lazy-contacts/attribution-cpu-profile.json'));v=r['result'];nodes={n['id']:n for n in p['nodes']};parents={c:n['id']for n in p['nodes']for c in n.get('children',[])}
def ancestors(s):
 while s in nodes:
  yield nodes[s]['callFrame'];s=parents.get(s)
t=p['startTime']/1000;data=[]
for sid,dt in zip(p['samples'],p['timeDeltas']):t+=dt/1000;data.append((t,sid,dt/1000))
hits=[x for x in data if any(f['functionName']=='_onEnd'for f in ancestors(x[1]))];groups=[]
for x in hits:
 if not groups or x[0]-groups[-1][-1][0]>100:groups.append([])
 groups[-1].append(x)
calls=[c for c in v['calls']if c['name']=='_onEnd'];bounds=[(g[-1][0]-c['t']-c['dt'],g[0][0]-c['t'])for g,c in zip(groups,calls)];lo=max(a for a,b in bounds);hi=min(b for a,b in bounds);assert lo<=hi;offset=(lo+hi)/2
report={'scope':'Actual CPU profile; timestamps mapped with two ordered _onEnd ancestor sample ranges contained in matching passive method entry/exit intervals. Independent Performance.getMetrics vs Runtime clock pair has tunnel delay and is not exact mapping.','offsetIntervalMs':[lo,hi],'offsetUsed':offset,'profileSamples':len(data),'windows':[]}
windows=[('dense-end',calls[0]['t'],calls[0]['t']+calls[0]['dt'])]
windows += [('tail-gap',f['t']-f['dt'],f['t'])for f in v['frames']if f['phase']=='settle-tail'and f['dt']>70]
for name,start,end in windows:
 hits=[(sid,dt)for t,sid,dt in data if start<=t-offset<=end];counter=collections.Counter()
 for sid,dt in hits:counter[sid]+=dt
 top=[{'ms':ms,'frame':nodes[sid]['callFrame'],'callers':[f['functionName']for f in list(ancestors(sid))[1:8]]}for sid,ms in counter.most_common(12)]
 nested=[c for c in v['calls']if start<=c['t']<=end and c['dt']>1]
 gl=[c for c in v['glCalls']if start<=c['t']<=end]
 report['windows'].append({'name':name,'start':start,'end':end,'samples':len(hits),'top':top,'calls':nested,'gl':gl})
json.dump(report,open('temp/lazy-contacts/profile-summary.json','w'),indent=2)
for w in report['windows']:print(w['name'],w['samples'],[(round(t['ms'],1),t['frame']['functionName'],t['callers'][:3])for t in w['top']], 'slowcalls',[(c['name'],round(c['dt'],1))for c in w['calls']], 'gl',[(c['name'],c['dt'])for c in w['gl']])
print('offset',report['offsetIntervalMs'])
