import json,glob,datetime,collections
out=[]
for p in sorted(glob.glob('temp/device-runs/qa-2026-10-02/long-session*.json')):
 x=json.load(open(p));rs=x.get('rounds',[]);names=sorted(set(n for r in rs for n in r.get('devices',{})))
 summary={'file':p.rsplit('/',1)[-1],'rounds':len(rs),'errors':len(x.get('errors',[])),'started':x.get('startedAt'),'ended':x.get('endedAt'),'tools':sorted(set(r.get('tool','?') for r in rs)),'devices':{},'countDisagreementRounds':0,'tailDisagreementRounds':0,'gridMax':max([r.get('diff',{}).get('max',0) for r in rs],default=0),'ipadGridMax':max([r.get('ipadDiff',{}).get('max',0) for r in rs],default=0)}
 for r in rs:
  ds=[d.get('state',{}) for d in r.get('devices',{}).values() if d.get('state')]
  if len(set(d.get('ops') for d in ds))>1:summary['countDisagreementRounds']+=1
  if len(set(json.dumps(d.get('tail',[]),sort_keys=True) for d in ds))>1:summary['tailDisagreementRounds']+=1
 for n in names:
  ds=[r['devices'][n] for r in rs if n in r.get('devices',{})];ss=[(d.get('stroke') or {}) for d in ds];states=[d['state'] for d in ds if d.get('state')]
  origins=[s['origin'] for s in states if s.get('origin')]
  summary['devices'][n]={'lastOps':states[-1].get('ops') if states else None,'lostObservations':sum(bool(s.get('lost')) for s in states),'originSpanMs':max(origins)-min(origins) if origins else None,'activeMax':max([s.get('activeMax',0) for s in ss],default=0),'tailMax':max([s.get('tailMax',0) for s in ss],default=0),'maxScratchMB':max([s.get('perf',{}).get('scratchLiveMB',0) for s in states],default=0)}
 summary['maxDuplicateConfirmations']=max([sum(v.get('duplicates',0) for v in r.get('virtual',[])) for r in rs],default=0)
 out.append(summary)
json.dump(out,open('temp/device-runs/qa-2026-10-02/long-summary.json','w'),indent=2)
for s in out:print(json.dumps(s,ensure_ascii=False))
