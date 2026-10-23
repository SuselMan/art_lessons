from pathlib import Path
import subprocess
p=Path('apps/web/src/engine/index.ts'); current=p.read_text()
try:
 p.write_text(Path('temp/494-layer-compositor/before.ts').read_text())
 with open('temp/494-layer-compositor/hairline-before.log','w') as f:r=subprocess.run('E2E_PORT_OFFSET=237 npx playwright test e2e/specs/flexibleHairline.spec.ts --config playwright.config.ts --project chromium --grep watercolor:',shell=True,stdout=f,stderr=subprocess.STDOUT)
 print('baseline before compositor exit',r.returncode)
finally:p.write_text(current)
