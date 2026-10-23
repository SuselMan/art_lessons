import json,statistics,collections
p='temp/ribbon-band-batch/native-compositor-on';r=json.load(open(p+'.json'))['result'];E=json.load(open(p+'-trace.json'))['traceEvents'];m={x['name']:x['startTime'] for x in r['marks']};offsets=[x['ts']/1000-m[x['name']] for x in E if x.get('ph')=='I' and x.get('name') in m];o=statistics.median(offsets);names={(x['pid'],x['tid']):x.get('args',{}).get('name') for x in E if x.get('name')=='thread_name'};out={'offsetRange':[min(offsets),max(offsets)],'gaps':[]}
for g in r['passiveGL']['gaps']:
 s=(g['t']-g['dt']+o)*1000;end=(g['t']+o)*1000
 hits=[x for x in E if x.get('ph')=='X' and x.get('ts',0)<end and x.get('ts',0)+x.get('dur',0)>s]
 top=sorted(hits,key=lambda x:x.get('dur',0),reverse=True)[:25]
 row={'t':g['t'],'dt':g['dt'],'top':[{'name':x['name'],'thread':names.get((x['pid'],x['tid'])),'t':x['ts']/1000-o,'durMs':x.get('dur',0)/1000,'threadCpuMs':x.get('tdur',0)/1000,'args':x.get('args')} for x in top]};out['gaps'].append(row)
json.dump(out,open(p+'-gap-summary.json','w'),indent=2);print(json.dumps(out,indent=2))
