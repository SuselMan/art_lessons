import subprocess,pathlib,json,os,datetime
base=pathlib.Path('temp/device-runs');resource=base/'745-final5-coordinator.json';r={'pid':os.getpid(),'owner':'/root/dry_contract','ttl':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=2)).isoformat(),'command':'python3 temp/device-runs/745-final5-sequence.py','runtime':'1e521993'};resource.write_text(json.dumps(r));records=[]
def call(label,command,more={}):
 env=os.environ.copy();env.update(more);result=subprocess.run(command,env=env);records.append({'case':label,'exit':result.returncode});(base/'745-final5-campaign-progress.json').write_text(json.dumps(records,indent=2))
def run(case,suffix,more={}):call(suffix,['python3','docs/qa/harness/728-undo-v1/night-wide/run-case.py','--case',case,'--cdp','http://127.0.0.1:19333','--output',str(base/('745-final5-'+suffix))],more)
run('background-immediate','background-immediate')
fixture=pathlib.Path.home()/'.local/share/project-services/gl1-review/night-wide-load100-a6e40c0d'
call('annotation100-coverage',['python3','docs/qa/harness/728-undo-v1/run-private-fixture.py','--fixture',str(fixture),'--cdp','http://127.0.0.1:19333','--script','night-wide/loading.cjs','--output',str(base/'745-final5-annotation100-coverage')],{'QA_LOAD_MODES':'annotations,compact-annotations','QA_LOAD_INPUT_PATH':str(fixture/'load-input.json')})
run('reconnect-dry','reconnect-dry')
run('guard-third-wet','guard-third-wet')
run('guard-geometry','guard-nonsquare',{'QA_CANVAS_WIDTH':'512','QA_CANVAS_HEIGHT':'768'})
run('guard-geometry','guard-oversize',{'QA_CANVAS_WIDTH':'1536','QA_CANVAS_HEIGHT':'1536','QA_GUARD_X':'2030'})
run('guard-geometry','guard-infinite',{'QA_INFINITE':'1'})
r.update(ended=True);resource.write_text(json.dumps(r))
