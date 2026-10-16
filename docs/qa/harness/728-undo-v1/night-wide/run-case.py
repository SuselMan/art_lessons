#!/usr/bin/env python3
"""Own disposable fixture, private auth env, one independent layer case."""
import argparse, pathlib, json, os, subprocess, uuid
p=argparse.ArgumentParser();p.add_argument('--case',required=True);p.add_argument('--cdp',required=True);p.add_argument('--output',required=True);args=p.parse_args()
root=pathlib.Path(__file__).resolve().parent;folder=pathlib.Path.home()/'.local/share/project-services/gl1-review'/('night-wide-'+args.case+'-'+uuid.uuid4().hex[:8]);env=os.environ.copy();env['QA_FIXTURE_OUTPUT']=str(folder)
subprocess.run(['node',str(root/'prepare-wide.cjs')],env=env,check=True)
f=json.loads((folder/'fixture.json').read_text());state=json.loads((folder/'host-state.json').read_text())
for c in state['cookies']:c['domain']='tools.pecni.com';c['secure']=True
for o in state.get('origins',[]):o['origin']='https://tools.pecni.com'
adapted=folder/'host-state-tools.json';adapted.write_text(json.dumps(state));adapted.chmod(0o600)
r=json.loads(pathlib.Path.home().joinpath('.local/share/project-services/services.json').read_text());services=r if isinstance(r,list) else r['services'];entry=next(s['url'] for s in services if s['name']=='Grafetto — М70 R2 (QA)')
env.update(QA_CDP=args.cdp,QA_ENTRY_URL=entry,QA_BASE_URL='https://tools.pecni.com',QA_ROOM=f['room'],QA_DISPOSABLE_ROOM=f['room'],QA_HOST_STATE=str(adapted),QA_OUTPUT=args.output,QA_LAYER_CASES=args.case)
out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True);(out/'private-fixture-path.txt').write_text(str(folder))
result=subprocess.run(['node',str(root/'layers.cjs')],env=env)
if result.returncode==0:
 env.update(QA_DELETE_DISPOSABLE_ROOM=f['room']);subprocess.run(['node',str(root.parent/'cleanup.cjs')],env=env,check=True)
 for name in ['host-state.json','host-state-tools.json']:(folder/name).unlink(missing_ok=True)
else:print('Own fixture retained for investigation:',f['room'])
raise SystemExit(result.returncode)
