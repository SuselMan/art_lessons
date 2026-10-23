import gzip,json,sys,collections
p=sys.argv[1]
r=json.load(gzip.open(p,'rt'));ev=r.get('traceEvents',[]);names=collections.Counter(x.get('name','') for x in ev)
marks=[x for x in ev if x.get('name','').startswith('owned_')]
threads={(x.get('pid'),x.get('tid')):x.get('args',{}).get('name') for x in ev if x.get('name')=='thread_name'}
interesting=[x for x in ev if any(k in x.get('name','').lower() for k in ['swapbuffer','drawandswap','gpu.task','gputask','flush','waitfor'])]
summary={'events':len(ev),'markers':[{'name':x.get('name'),'ts':x.get('ts'),'pid':x.get('pid'),'tid':x.get('tid'),'args':x.get('args')} for x in marks],'selectedNames':dict(collections.Counter(x.get('name') for x in interesting)), 'longSelected':[{'name':x.get('name'),'ts':x.get('ts'),'dur':x.get('dur'),'phase':x.get('ph'),'thread':threads.get((x.get('pid'),x.get('tid'))),'pid':x.get('pid'),'tid':x.get('tid')} for x in interesting if x.get('dur',0)>=1000], 'metadataThreads':[{'pid':a,'tid':b,'name':n} for (a,b),n in threads.items()]}
open(p+'.summary.json','w').write(json.dumps(summary,indent=2));print(json.dumps({'events':len(ev),'markers':len(marks),'selectedNames':summary['selectedNames'],'longSelected':len(summary['longSelected'])}))
