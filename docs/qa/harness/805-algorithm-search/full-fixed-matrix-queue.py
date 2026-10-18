#!/usr/bin/env python3
"""Single physical-device scheduler; every closed cell remains bound to exact sources/bytes."""
import os,json,pathlib,hashlib,subprocess,shutil,time,datetime,zlib
cache=pathlib.Path(os.environ['QA_CACHE']);out=cache/'full-fixed-matrix-queue';out.mkdir(exist_ok=True)
catalog=json.loads(pathlib.Path('/home/suselman/.cache/codex-qa/flow805-frozen-input30/catalog.json').read_text());manifest=json.loads((cache/'review-135x30-job-manifest.json').read_text());native=cache/'native-component-matrix-results'
changed={'wgsl-macro-dynamic-wetness','wgsl-macro-dynamic-wetness-smooth','wgsl-macro-dynamic-wetness-smooth-dither','wgsl-macro-paper-particles','wgsl-macro-paper-particles-compact','wgsl-macro-paper-particles-safe'}
sha=lambda b:hashlib.sha256(b).hexdigest()
def key(r):return json.dumps({k:r.get(k)for k in['algorithm','fixture','encoding','config']},sort_keys=True)
def sources(build):return{x['file']:sha((build/x['file']).read_bytes())for x in json.loads((build/'manifest.json').read_text())['files']}
expected={name:sources(cache/name)for name in['fixed-matrix-final-v1','fixed-matrix-final-v4']};done=set();reused=[]
paths=[cache/'final-worker-noncapillary-results/batch-000-part0/report.json',*sorted((cache/'final-worker-noncapillary-nonparticle-results').glob('*/report.json')),*sorted(out.glob('worker-*/report.json'))]
ledger_script="const fs=require('fs'),{auditLedgerGuards}=require('./docs/qa/harness/805-algorithm-search/ledger-guards.cjs');const a=JSON.parse(fs.readFileSync(process.argv[1]));console.log(JSON.stringify(a.cases.map(r=>{try{return r.pass===true&&auditLedgerGuards(r.result.metadata||{}).pass}catch(e){return false}})))"
for p in paths:
 report=json.loads(p.read_text())
 if not report.get('contextClosed'):continue
 valid=json.loads(subprocess.check_output(['node','-e',ledger_script,str(p)],text=True));build='fixed-matrix-final-v4'if report.get('sourceHashes')==expected['fixed-matrix-final-v4']else'fixed-matrix-final-v1'
 if report.get('sourceHashes')!=expected[build]:continue
 for row,okay in zip(report['cases'],valid):
  if not okay or row['request'].get('repeats',0)<3:continue
  if(row['request']['algorithm']in changed)!=(build=='fixed-matrix-final-v4'):continue
  audit=row.get('rawAudit',{});carrier=row.get('carrier',{});result=row['result']
  if not(audit.get('pass')and row.get('fixedInitialWetVerified')and audit.get('rawSHA')==carrier.get('decodedSHA256')==result['hashes'][-1]and audit.get('sourceHashes')==expected[build]):continue
  if sha((p.parent/row['png']['file']).read_bytes())!=row['png']['sha256']:continue
  if sha(zlib.decompress((p.parent/carrier['file']).read_bytes(),31))!=carrier['decodedSHA256']:continue
  done.add(key(row['request']));reused.append({'report':str(p),'key':key(row['request']),'ledgerReverified':True})
nonce=str(time.time_ns());state={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reusedWorker':len(done),'reusedEvidence':reused,'runs':[],'sourceByBuild':expected};save=lambda:(out/'queue.json').write_text(json.dumps(state,indent=2))
def wait_resource():
 while shutil.disk_usage(cache).free<1536*1024**2 or(out/'pause').exists():time.sleep(5)
def run(argv,env,log):
 with log.open('w')as f:return subprocess.run(argv,env=env,stdout=f,stderr=subprocess.STDOUT).returncode
save()
for item in catalog:
 for build in ['fixed-matrix-final-v1','fixed-matrix-final-v4']:
  requests=[]
  for job in manifest['jobs']:
   if job['kind']!='worker':continue
   inp=manifest['inputs'][job['inputIndex']];r={**job['request'],'fixedInitialWet':True,'expectedInputSHA':inp['sha'],'exportRaw':False,'exportRawGzip':True}
   if r['fixture']!=item['id']or key(r)in done or((r['algorithm']in changed)!=(build=='fixed-matrix-final-v4')):continue
   assert r['encoding']==item['encoding']and r['expectedInputSHA']==item['sha'];requests.append(r)
  while requests:
   wait_resource();take=requests[:128];requests=requests[128:];part=0
   while take:
    tag='worker-'+item['id']+'-'+build+'-'+nonce+'-'+str(len(state['runs']));dest=out/tag;dest.mkdir(exist_ok=False);casefile=dest/'requests.json';casefile.write_text(json.dumps(take));env=dict(os.environ,QA_BUILD=str(cache/build),QA_OUTPUT=str(dest),QA_CASES_FILE=str(casefile),QA_FIXED_INPUT_CATALOG='/home/suselman/.cache/codex-qa/flow805-frozen-input30/catalog.json',QA_FLOW_REQUIRED='0',QA_ARTIFACT_STORE=str(cache/'final-artifacts'))
    code=run(['node','docs/qa/harness/805-algorithm-search/flow-run.cjs'],env,dest/'runner.log');report=json.loads((dest/'report.json').read_text());assert report.get('contextClosed')is True;consumed=len(report['cases']);state['runs'].append({'kind':'worker','fixture':item['id'],'build':build,'directory':str(dest),'attempted':consumed,'passed':sum(r.get('pass')is True for r in report['cases']),'code':code,'failure':report.get('failure')});save()
    if consumed==0:raise RuntimeError('Bootstrap failed: stop without retrying blindly')
    take=take[consumed:];part+=1
 for_native=dict(os.environ,QA_CACHE=str(cache),QA_OUTPUT=str(native),QA_SCENES=item['id'],QA_REPEATS='3')
 wait_resource();log=out/('native-'+item['id']+'.log');code=run(['node','docs/qa/harness/805-algorithm-search/native-component-matrix.cjs'],for_native,log);nr=json.loads((native/'report.json').read_text());rows=[r for r in nr['cases']if r['request']['fixture']==item['id']];state['runs'].append({'kind':'native','fixture':item['id'],'passed':sum(r.get('pass')is True for r in rows),'code':code,'directory':str(native)});save()
state['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
