#!/usr/bin/env python3
"""CPU-only coverage refresh after closed fixture; never touches a device or public main index."""
import os,pathlib,json,subprocess,time,datetime
cache=pathlib.Path(os.environ['QA_CACHE']);directory=cache/'full-fixed-matrix-queue';queue=directory/'queue.json';script='/home/suselman/.cache/codex-qa/flow805-frozen-input30/refresh-coverage-preview.py';state={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':[]};seen=sum(r['kind']=='native'for r in json.loads(queue.read_text())['runs'])
def save():(directory/'preview-watch.json').write_text(json.dumps(state,indent=2))
save()
while True:
 try:q=json.loads(queue.read_text())
 except json.JSONDecodeError:time.sleep(1);continue
 closed=sum(r['kind']=='native'for r in q['runs'])
 if closed>seen:
  health=directory/('device-health-'+str(closed)+'.json')
  healthCode=subprocess.run(['python3',str(pathlib.Path(__file__).with_name('matrix-device-health.py')),str(health)]).returncode
  state['lastHealth']={'closedFixtures':closed,'code':healthCode,'file':str(health)};save()
  log=directory/('preview-refresh-'+str(closed)+'.log')
  with log.open('w')as f:code=subprocess.run(['python3',script],stdout=f,stderr=subprocess.STDOUT).returncode
  state['runs'].append({'closedFixtures':closed,'code':code,'log':str(log),'at':datetime.datetime.now(datetime.timezone.utc).isoformat()});seen=closed;save()
  if code:state['failure']='CPU coverage refresh failed; inspect log';save()
 if q.get('finishedAt'):break
 time.sleep(10)
state['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
