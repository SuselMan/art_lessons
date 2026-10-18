#!/usr/bin/env python3
"""Only seven explicitly authorized Curtis scenes. Never resumes stopped old matrices."""
import pathlib,json,subprocess,os,signal,datetime
cache=pathlib.Path(os.environ['QA_CACHE']);out=cache/'curtis-final7-v5-split-fixtures';out.mkdir(exist_ok=True);build=cache/'curtis-transport-build-v5';ids=['mini-wave','mini-two-colors','gallery-sheet-1-slot-17','gallery-sheet-2-slot-7','gallery-sheet-3-slot-1','gallery-sheet-4-slot-1','gallery-sheet-5-slot-1'];state={'pid':os.getpid(),'owner':'puddle_undo','scope':'ONLY Curtis seven fixtures, five checkpoints, three repeats; old135/timed120 paused','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':[]};child=None
def save():
 p=out/'queue.json';p.with_suffix('.tmp').write_text(json.dumps(state,indent=2));p.with_suffix('.tmp').replace(p)
def stop(signum,frame):
 state['interrupted']=signum
 if child and child.poll()is None:child.send_signal(signal.SIGINT)
 save();raise SystemExit(128+signum)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop);save()
for fixture in ids:
 dest=out/fixture;dest.mkdir(exist_ok=True);report=dest/'report.json'
 if report.exists():raise RuntimeError('Existing fixture report: no blind overwrite/retry')
 cases=dest/'cases.json';cases.write_text(json.dumps([{'fixture':fixture,'steps':steps,'repeats':3}for steps in[0,16,64,256,1024]]))
 env=dict(os.environ,QA_SPLIT_REPEATS='1',QA_BUILD=str(build),QA_CASES_FILE=str(cases),QA_OUTPUT=str(dest))
 with(dest/'runner.log').open('w')as log:
  child=subprocess.Popen(['node','docs/qa/harness/805-algorithm-search/curtis-run.cjs'],env=env,stdout=log,stderr=subprocess.STDOUT);state['active']={'fixture':fixture,'pid':child.pid,'report':str(report)};save();code=child.wait()
 r=json.loads(report.read_text())if report.exists()else{};state['runs'].append({'fixture':fixture,'code':code,'pass':r.get('pass')is True,'report':str(report)});state.pop('active',None);save()
 if code or not r.get('pass'):state['failure']='Fixture failed/stopped; preserve exact report and stop';save();raise SystemExit(1)
state['pass']=len(state['runs'])==7;state['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
