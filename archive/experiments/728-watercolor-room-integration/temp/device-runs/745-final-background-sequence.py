import subprocess,pathlib,time,json,datetime,os
base=pathlib.Path('temp/device-runs');resource=base/'745-background-coordinator.json';r={'pid':os.getpid(),'owner':'/root/dry_contract','ttl':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=2)).isoformat(),'command':'python3 temp/device-runs/745-final-background-sequence.py'};resource.write_text(json.dumps(r))
while True:
 p=base/'745-final3-campaign-progress.json'
 if p.exists() and len(json.loads(p.read_text()))>=7:break
 time.sleep(2)
result=subprocess.run(['python3','docs/qa/harness/728-undo-v1/night-wide/run-case.py','--case','background-dry','--cdp','http://127.0.0.1:19333','--output',str(base/'745-final3-background-dry')]);r.update(ended=True,exit=result.returncode);resource.write_text(json.dumps(r))
