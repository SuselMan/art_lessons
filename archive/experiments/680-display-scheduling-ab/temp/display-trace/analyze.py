import gzip,json,collections,os
root='temp/display-trace/results';p=root+'/trace.json.gz'
with gzip.open(p,'rb') as f:
 raw=f.read(64*1024*1024+1)
 if len(raw)>64*1024*1024:raise Exception('decode cap')
e=json.loads(raw)['traceEvents'];metadata={(x['pid'],x.get('tid')):x.get('args',{}).get('name') for x in e if x.get('ph')=='M' and x.get('name')=='thread_name'}
counter=collections.Counter(x.get('name') for x in e);group=collections.defaultdict(list)
for x in e:
 if x.get('ph')=='X' and x.get('dur',0)>0:group[(x.get('name'),metadata.get((x.get('pid'),x.get('tid')),''))].append(x['dur']/1000)
rows=[]
for(k,t),vs in group.items():
 vs.sort();rows.append({'name':k,'thread':t,'count':len(vs),'p50':vs[len(vs)//2],'p95':vs[int(.95*(len(vs)-1))],'max':vs[-1]})
rows.sort(key=lambda x:x['max'],reverse=True)
r={'complete':True,'events':len(e),'decodedBytes':len(raw),'compressedBytes':os.path.getsize(p),'topDurationEvents':rows[:35],'frameEventNames':{k:v for k,v in counter.items()if any(t in str(k).lower()for t in ['swap','frame','submit','present','makecurrent'])},'flowEventCount':sum(x.get('ph')in ('s','t','f')for x in e),'limitation':'No nested-duration sums. Native rAF/trace clock mapping not recorded; no asserted frame-submit-to-present latency without valid paired flow/timebase.'}
json.dump(r,open(root+'/trace-summary.json','w'),indent=2);print(json.dumps(r))
