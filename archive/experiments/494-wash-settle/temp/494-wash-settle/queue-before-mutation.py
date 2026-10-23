from pathlib import Path
import subprocess
p=Path('apps/web/src/engine/index.ts');original=p.read_text();old='if (ops.length) { ops[0](); this._settle.next = 1 }'
assert old in original
try:
 p.write_text(original.replace(old,'if (ops.length) { this._settle.next = 1 }',1))
 with Path('temp/494-wash-settle/queue-before-mutation.log').open('w') as log:
  code=subprocess.run(['npx','vitest','run','--maxWorkers=1','apps/web/src/engine/index.settle.test.ts'],stdout=log,stderr=subprocess.STDOUT).returncode
 if code==0 or 'AssertionError' not in Path('temp/494-wash-settle/queue-before-mutation.log').read_text():raise RuntimeError('queue mutation was not caught')
 print('first-entry omission detected, exit',code)
finally:p.write_text(original)
