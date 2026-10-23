import json,sys,datetime
from pathlib import Path
p=Path('/home/suselman/.codex/sessions/2026/10/01/rollout-2026-10-01T11-38-41-01a0f69d-a2ec-7473-be68-dd7ee6cbec86.jsonl')
with p.open('rb') as f:
 f.seek(max(0,p.stat().st_size-1800000));rows=f.read().splitlines()
for row in reversed(rows):
 try:x=json.loads(row)
 except (ValueError,UnicodeDecodeError):continue
 if x.get('type')!='event_msg' or x.get('payload',{}).get('type')!='token_count' or not x['payload'].get('rate_limits'):continue
 limits=x['payload']['rate_limits'];windows=[v['used_percent'] for v in limits.values() if isinstance(v,dict) and v.get('used_percent') is not None]
 age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(x['timestamp'].replace('Z','+00:00'))).total_seconds()
 print(json.dumps({'timestamp':x['timestamp'],'ageSeconds':round(age,1),'used_percent':windows,'stop_at':21}))
 if windows and max(windows)>=21:
  c=Path.home()/'.local/share/codex-continuation/watercolor.json';s=json.loads(c.read_text());s['enabled']=False;s['reason']='Night budget used_percent >= 21';c.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n');sys.exit(75)
 if not windows or age>180:sys.exit(74)
 sys.exit(0)
print('Fresh rate_limits unavailable');sys.exit(74)
