from pathlib import Path
import os, subprocess
p=Path('apps/web/src/engine/src/buffers/RibbonReplayCache.ts');original=p.read_text()
try:
 p.write_text(original.replace('  cancelSpillJob(): void {','  cancelSpillJob(): void {\n    return // QA control: deliberately break cancellation',1))
 env=dict(os.environ,AB_LABEL='mutation',E2E_GL='swiftshader',E2E_PORT_OFFSET='231')
 with open('temp/494-wash-cache/mutation.log','w') as out:
  r=subprocess.run(['npx','playwright','test','--config','temp/494-wash-cache/ab.config.ts','--grep','bounded'],env=env,stdout=out,stderr=subprocess.STDOUT)
 log=Path('temp/494-wash-cache/mutation.log').read_text()
 assert r.returncode!=0 and 'cancel lost active wash' in log, 'Mutation did not fail for intended reason'
 print('Control mutation detected: cancel lost active wash')
finally:
 p.write_text(original)
