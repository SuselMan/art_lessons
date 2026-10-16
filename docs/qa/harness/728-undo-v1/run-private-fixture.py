#!/usr/bin/env python3
"""Load private local fixture/gateway details without putting tokens in argv/output."""
import argparse, json, os, pathlib, subprocess
p=argparse.ArgumentParser();p.add_argument('--fixture',required=True);p.add_argument('--cdp',required=True);p.add_argument('--script',choices=['capture.cjs','room.cjs','no-ghost.cjs','disjoint-dry.cjs','scoped-dry.cjs','../728-night/held-live.cjs','../728-night/short-live.cjs','../728-night/undo-latency.cjs','../728-night/undo100-cache.cjs','../728-night/samsung-live.cjs','../728-night/long-live.cjs','night-wide/loading.cjs','../728-night/samsung-loading.cjs','../728-night/warm-loading.cjs'],default='capture.cjs');p.add_argument('--output',required=True);p.add_argument('--dry-live',action='store_true');p.add_argument('--save-target-bytes',action='store_true');p.add_argument('--compare-live',action='store_true');args=p.parse_args()
folder=pathlib.Path(args.fixture);fixture=json.loads((folder/'fixture.json').read_text())
assert fixture.get('disposable') and fixture['room'].startswith('qa-undo-v1-')
state=json.loads((folder/'host-state.json').read_text())
for cookie in state['cookies']:cookie['domain']='tools.pecni.com';cookie['secure']=True
for origin in state.get('origins',[]):origin['origin']='https://tools.pecni.com'
adapted=folder/'host-state-tools.json';adapted.write_text(json.dumps(state));adapted.chmod(0o600)
registry=json.loads(pathlib.Path.home().joinpath('.local/share/project-services/services.json').read_text());services=registry if isinstance(registry,list) else registry['services'];entry=next(s['url'] for s in services if s['name']=='Grafetto — М70 R2 (QA)')
env=os.environ.copy();env.update(QA_CDP=args.cdp,QA_ENTRY_URL=entry,QA_BASE_URL='https://tools.pecni.com',QA_ROOM=fixture['room'],QA_DISPOSABLE_ROOM=fixture['room'],QA_HOST_STATE=str(adapted),QA_OUTPUT=args.output)
if args.dry_live:env['QA_DRY_LIVE']='1'
if args.save_target_bytes:env['QA_SAVE_TARGET_BYTES']='1'
if args.compare_live:env['QA_COMPARE_LIVE']='1'
raise SystemExit(subprocess.run(['node',str(pathlib.Path(__file__).parent / args.script)],env=env).returncode)
