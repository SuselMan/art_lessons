from pathlib import Path
import subprocess, os
p=Path('apps/web/src/engine/index.ts');original=p.read_text()
try:
 p.write_text(subprocess.check_output(['git','show','b7d2b6a9:apps/web/src/engine/index.ts'],text=True))
 with open('temp/494-wash-cache/hairline-baseline.log','w') as f:
  r=subprocess.run(['npx','playwright','test','e2e/specs/flexibleHairline.spec.ts','--grep','watercolor'],env=dict(os.environ,E2E_GL='swiftshader',E2E_PORT_OFFSET='231'),stdout=f,stderr=subprocess.STDOUT)
 print('baseline exit:',r.returncode)
finally:
 p.write_text(original)
