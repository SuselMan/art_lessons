#!/usr/bin/env python3
"""Sequential owned-device chunks. A failed row is recorded, never counted complete."""
import json,pathlib,os,subprocess,datetime,time,shutil,hashlib
cache=pathlib.Path(os.environ['QA_CACHE']); plan=cache/'final-worker-plan';out=cache/'final-worker-noncapillary-nonparticle-results';out.mkdir(exist_ok=True)
excluded_ids={'wgsl-macro-paper-particles','wgsl-macro-paper-particles-compact','wgsl-macro-paper-particles-safe','wgsl-macro-dynamic-wetness','wgsl-macro-dynamic-wetness-smooth','wgsl-macro-dynamic-wetness-smooth-dither'}
def key(r):return json.dumps({k:r.get(k) for k in ['algorithm','fixture','encoding','config']},sort_keys=True)
prior=json.loads((cache/'final-worker-noncapillary-results/batch-000-part0/report.json').read_text());assert prior['contextClosed']
manifest=json.loads((cache/'fixed-matrix-final-v1/manifest.json').read_text());assert {x['file']:hashlib.sha256((cache/'fixed-matrix-final-v1'/x['file']).read_bytes()).hexdigest() for x in manifest['files']}==prior['sourceHashes']
done=set()
for row in prior['cases']:
 if row.get('pass'):
  assert row['rawAudit']['pass'] and row['rawAudit']['rawSHA']==row['carrier']['decodedSHA256']==row['result']['hashes'][-1]
  assert row['rawAudit']['sourceHashes']==prior['sourceHashes'];done.add(key(row['request']))
excluded=[];jobs=[]
for p in sorted(plan.glob('batch-*.json')):
 rows=json.loads(p.read_text());excluded += [r for r in rows if r['algorithm'] in excluded_ids];rows=[r for r in rows if r['algorithm'] not in excluded_ids and key(r) not in done]
 if rows:jobs.append((p.stem,rows))
(out/'excluded.json').write_text(json.dumps(excluded,indent=2));state={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reusedVerified':len(done),'excluded':len(excluded),'planned':sum(len(x[1]) for x in jobs),'runs':[]}
def save():(out/'queue.json').write_text(json.dumps(state,indent=2))
save()
for name,rows in jobs:
 while (out/'pause-before-next-chunk').exists():time.sleep(2)
 attempt=0
 while rows:
  dest=out/(name+'-part'+str(attempt))
  if dest.exists():
   previous=json.loads((dest/'report.json').read_text());assert previous.get('contextClosed') is True
   manifest=json.loads((cache/'fixed-matrix-final-v1/manifest.json').read_text());current={x['file']:hashlib.sha256((cache/'fixed-matrix-final-v1'/x['file']).read_bytes()).hexdigest() for x in manifest['files']};assert current==previous['sourceHashes']
   assert json.loads((dest/'requests.json').read_text())==rows
   consumed=len(previous['cases']);assert consumed>0
   for row in previous['cases']:
    if row.get('pass'):assert row.get('rawAudit',{}).get('pass') is True and row.get('fixedInitialWetVerified') is True
   state['runs'].append({'directory':str(dest),'resumedClosedReport':True,'attempted':consumed,'passed':sum(r.get('pass') is True for r in previous['cases']),'sourceReverified':True,'failure':previous.get('failure')});save()
   rows=rows[consumed:];attempt+=1;continue
  while shutil.disk_usage(cache).free<1536*1024**2:time.sleep(5)
  dest.mkdir(exist_ok=False);casefile=dest/'requests.json';casefile.write_text(json.dumps(rows))
  env=dict(os.environ,QA_BUILD=str(cache/'fixed-matrix-final-v1'),QA_OUTPUT=str(dest),QA_CASES_FILE=str(casefile),QA_FIXED_INPUT_CATALOG='/home/suselman/.cache/codex-qa/flow805-frozen-input30/catalog.json',QA_FLOW_REQUIRED='0',QA_ARTIFACT_STORE=str(cache/'final-artifacts'))
  with (dest/'runner.log').open('w') as log: code=subprocess.run(['node','docs/qa/harness/805-algorithm-search/flow-run.cjs'],env=env,stdout=log,stderr=subprocess.STDOUT).returncode
  report=json.loads((dest/'report.json').read_text());done=len(report['cases']);assert report.get('contextClosed') is True
  state['runs'].append({'directory':str(dest),'code':code,'attempted':done,'passed':sum(r.get('pass') is True for r in report['cases']),'failure':report.get('failure')});save()
  if done==0:raise RuntimeError('Bootstrap failure: stop queue')
  rows=rows[done:];attempt+=1
state['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
