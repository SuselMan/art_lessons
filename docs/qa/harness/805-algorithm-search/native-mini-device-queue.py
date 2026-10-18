#!/usr/bin/env python3
"""Only seven certified native direct-target gates; never starts old matrix queues."""
import os,json,pathlib,subprocess,datetime,hashlib,signal,sys
root=pathlib.Path(__file__).resolve().parents[4];cache=pathlib.Path(os.environ['QA_CACHE']).resolve();durable=pathlib.Path(os.environ['QA_DURABLE']).resolve();runner=root/'docs/qa/harness/805-algorithm-search/native-mini-direct-run.cjs'
scenes=['mini-wave','mini-two-colors','gallery-sheet-1-slot-17','gallery-sheet-2-slot-7','gallery-sheet-3-slot-1','gallery-sheet-4-slot-1','gallery-sheet-5-slot-1'];queue={'pid':os.getpid(),'scope':'Only seven certified native direct target cases × original/optimized ×3; full RAW/source guards, no component wrapper','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases':[]};child=None
path=cache/'direct-queue.json'
def save():
 pending=path.with_suffix('.pending');pending.write_text(json.dumps(queue,indent=2));pending.replace(path)
def stop(sig,frame):
 queue['status']='stopped';queue['signal']=sig;save()
 if child and child.poll() is None:child.send_signal(signal.SIGINT)
 raise SystemExit(128+sig)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
def check(report,profile,scene):
 assert report['pass']and report['sourceStable']and report['contextClosed'];assert report['request']['fixture']==scene and report['request']['profile']==profile;assert len(report['hashes'])==3 and all(x==report['hashes'][0]for x in report['hashes']);assert len(report['samples'])==3
 if profile=='optimized':
  last=0
  for evidence in report['evidence']:
   s=evidence['optimization'];assert s['policy']=='qa-native-mini-no-mobile-v1';assert s['jobsActivated']==last+int(s['lastActivated']);last=s['jobsActivated']
   if scene=='mini-wave':assert s['lastActivated'] is True
   if scene=='mini-two-colors':assert s['lastActivated'] is False and s['jobsActivated']==0
for scene in scenes:
 for profile in ['original','optimized']:
  output=cache/'direct'/scene/profile;reportfile=output/'report.json';build=cache/('build-'+profile);manifestSHA=hashlib.sha256((build/'manifest.json').read_bytes()).hexdigest();row={'scene':scene,'profile':profile,'report':str(reportfile)};queue['cases'].append(row);save()
  try:
   if reportfile.exists():
    report=json.loads(reportfile.read_text());check(report,profile,scene);assert report['buildManifestSHA']==manifestSHA;row['reusedClosed']=True
   else:
    output.mkdir(parents=True,exist_ok=True);env={**os.environ,'QA_BUILD':str(build),'QA_OUTPUT':str(output),'QA_DURABLE':str(durable),'QA_SCENE':scene,'QA_REPEATS':'3'}
    if profile=='optimized':env['QA_EXPECTED']=str(cache/'direct'/scene/'original/report.json')
    else:env.pop('QA_EXPECTED',None)
    with (output/'runner.log').open('w') as log:
     child=subprocess.Popen(['node',str(runner)],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT);row['pid']=child.pid;queue['active']=row;save();code=child.wait();row['exitCode']=code;assert code==0
    report=json.loads(reportfile.read_text());check(report,profile,scene)
   if profile=='optimized':assert report['hashes']==json.loads((cache/'direct'/scene/'original/report.json').read_text())['hashes']
   row['pass']=True;row['reportSHA256']=hashlib.sha256(reportfile.read_bytes()).hexdigest();queue.pop('active',None);save()
  except BaseException as error:
   row['pass']=False;queue['failure']=repr(error);queue['pass']=False;save();raise
queue['pass']=True;queue['status']='complete';queue['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps({'pass':True,'cases':len(queue['cases'])}))
