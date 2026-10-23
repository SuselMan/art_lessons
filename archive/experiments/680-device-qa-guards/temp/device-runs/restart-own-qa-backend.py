import os, signal, subprocess, time
from pathlib import Path
pid=872460
expected=Path('/home/suselman/projects/pencil-agents/680-combined-stability/apps/server')
assert Path(f'/proc/{pid}/cwd').resolve()==expected, 'QA backend cwd mismatch'
args=[x.decode() for x in Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0') if x]
env=dict(x.decode().split('=',1) for x in Path(f'/proc/{pid}/environ').read_bytes().split(b'\0') if x)
assert env.get('PORT')=='4537', 'QA backend port mismatch'
log=expected.parent.parent/'temp/context-loss/qa-cold-restart.log'
os.kill(pid,signal.SIGTERM)
for _ in range(100):
 if not Path(f'/proc/{pid}').exists(): break
 time.sleep(.1)
else: raise RuntimeError('Old QA backend did not exit; no second process started')
with log.open('ab') as f:
 proc=subprocess.Popen(args,cwd=expected,env=env,stdin=subprocess.DEVNULL,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
print('Own QA backend4537 restarted, pid',proc.pid)
