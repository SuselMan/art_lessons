import subprocess,pathlib,json,time,os,datetime
base=pathlib.Path('temp/device-runs');resource=base/'745-final3-coordinator.json';resource.write_text(json.dumps({'pid':os.getpid(),'owner':'/root/dry_contract','ttl':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=2)).isoformat(),'command':'python3 temp/device-runs/745-final3-sequence.py'}))
while True:
 p=base/'745-final2-campaign-progress.json'
 if p.exists() and len(json.loads(p.read_text()))>=6:break
 time.sleep(2)
records=[]
def run(case,suffix,extra=[],envmore={}):
 env=os.environ.copy();env.update(envmore);out=base/('745-final3-'+suffix)
 result=subprocess.run(['python3','docs/qa/harness/728-undo-v1/night-wide/run-case.py','--case',case,'--cdp','http://127.0.0.1:19333','--output',str(out),*extra],env=env)
 records.append({'case':case,'output':str(out),'exit':result.returncode});(base/'745-final3-campaign-progress.json').write_text(json.dumps(records,indent=2))
run('merge-fallback','merge-diagnostic',envmore={'QA_MERGE_DIAGNOSTICS':'1'})
run('reconnect','reconnect')
run('load100','load100',['--script','loading.cjs','--load-strokes','100','--load-dabs','8','--dry-every','20'])
run('guard-third-wet','guard-third-wet')
run('guard-geometry','guard-nonsquare',envmore={'QA_CANVAS_WIDTH':'512','QA_CANVAS_HEIGHT':'768'})
run('guard-geometry','guard-oversize',envmore={'QA_CANVAS_WIDTH':'1536','QA_CANVAS_HEIGHT':'1536','QA_GUARD_X':'2030'})
run('guard-geometry','guard-infinite',envmore={'QA_INFINITE':'1'})
r=json.loads(resource.read_text());r['ended']=True;resource.write_text(json.dumps(r))
