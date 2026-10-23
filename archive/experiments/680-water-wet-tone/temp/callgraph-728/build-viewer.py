from pathlib import Path
import json,collections,shutil
rfile=sorted(Path('temp/callgraph-728').glob('report-*.json'))[-1];report=json.loads(rfile.read_text());r=report['cases'][0];assert report['complete'] and r['complete']
cpu=json.loads(Path(r['cpuProfileFile']).read_text());stats=collections.Counter();ns={n['id']:n for n in cpu['nodes']}
for ident,delta in zip(cpu['samples'],cpu['timeDeltas']):
 n=ns[ident]['callFrame'];stats[(n['functionName'],n['url'],n['lineNumber'])]+=delta/1000
sampled=[dict(name=k[0],url=k[1],line=k[2],selfMs=v) for k,v in stats.most_common()]
data={'source':report['source'],'passport':r['passport'],'flags':r['flags'],'motion':r['motion'],'counter':r['methodProfile'],'cpu':sampled,'durableOperations':len(r['db']['data']),'sourceSHA':r['loadedSHA'],'gl':r['final']['gl'],'lost':r['final']['lost']}
Path('docs/qa/callgraph-viewer/data.json').write_text(json.dumps(data,ensure_ascii=False))
shutil.copyfile(r['cpuProfileFile'],'docs/qa/callgraph-viewer/scenario.cpuprofile')
