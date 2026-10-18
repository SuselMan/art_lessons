#!/usr/bin/env python3
"""Second sequential GPU phase: starts only after the functional matrix process ends."""
import pathlib,json,os,time,subprocess,datetime,hashlib,shutil
cache=pathlib.Path(os.environ['QA_CACHE']);out=cache/'native-component-timed-queue';out.mkdir(exist_ok=True);functional=cache/'full-fixed-matrix-queue/queue.json';state={'pid':os.getpid(),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':[],'phase':'waiting-functional-queue'}
def save():
 p=out/'queue.json';p.with_suffix('.tmp').write_text(json.dumps(state,indent=2));p.with_suffix('.tmp').replace(p)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
save()
while True:
 try:q=json.loads(functional.read_text())
 except json.JSONDecodeError:time.sleep(2);continue
 if q.get('finishedAt'):break
 time.sleep(10)
# Functional completion alone is not certification: only verified native cells get timed.
canonical=json.loads((cache/'native-component-matrix-results/report.json').read_text());catalog=json.loads(pathlib.Path('/home/suselman/.cache/codex-qa/flow805-frozen-input30/catalog.json').read_text());state['phase']='timed-native-only';save()
for item in catalog:
 for arm in ['original','lazy','one-octave','cache']:
  proof=next((r for r in canonical['cases']if r.get('pass')and r['request']=={'fixture':item['id'],'arm':arm}),None)
  if not proof:
   state['runs'].append({'fixture':item['id'],'arm':arm,'blocked':'No certified functional native cell'});save();continue
  build=cache/('native-component-timed-v2-'+arm);dest=out/(item['id']+'-'+arm);dest.mkdir(exist_ok=True);report=dest/'report.json'
  if report.exists():
   r=json.loads(report.read_text())
   if r.get('pass')and r.get('contract')=='native-preloaded-source-to-common-cpu-material-v2'and r.get('repeatExact')and len(r.get('samples',[]))>=3 and r.get('sourceStable')and r.get('contextClosed')and r.get('buildManifestSHA')==digest(build/'manifest.json')and r.get('commonCarrierSHA')==proof['commonCarrier']['sha256']:
    state['runs'].append({'fixture':item['id'],'arm':arm,'reused':True,'report':str(report)});save();continue
   state['runs'].append({'fixture':item['id'],'arm':arm,'blocked':'Existing invalid report retained; no blind retry','report':str(report)});save();continue
  while shutil.disk_usage(cache).free<1536*1024**2 or(out/'pause').exists():time.sleep(5)
  env=dict(os.environ,QA_BUILD=str(build),QA_OUTPUT=str(dest),QA_SCENE=item['id'],QA_ARM=arm)
  with(dest/'runner.log').open('w')as log:code=subprocess.run(['node','docs/qa/harness/805-algorithm-search/native-component-timed-run.cjs'],env=env,stdout=log,stderr=subprocess.STDOUT).returncode
  r=json.loads(report.read_text())if report.exists()else{}
  state['runs'].append({'fixture':item['id'],'arm':arm,'code':code,'pass':r.get('pass')is True,'report':str(report)});save()
state['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();state['pass']=len(state['runs'])==120 and all(r.get('pass')or r.get('reused')for r in state['runs']);save()
