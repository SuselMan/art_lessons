from pathlib import Path
import os,subprocess
p=Path('apps/web/src/engine/src/dabs/RibbonStrokePainter.ts');original=p.read_text()
try:
 p.write_text(original.replace('if (!drawable.length) return','if (true) return // QA control: drop every ribbon batch',1))
 with open('temp/494-ribbon-painter/mutation.log','w') as f:
  r=subprocess.run(['npx','playwright','test','--config','temp/494-ribbon-painter/ab.config.ts','--grep','bounded'],env=dict(os.environ,AB_LABEL='mutation',E2E_GL='swiftshader',E2E_PORT_OFFSET='232'),stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode and 'ribbon left no paint' in Path('temp/494-ribbon-painter/mutation.log').read_text(),'Control did not fail for intended reason'
 print('Control detected: ribbon left no paint')
finally:
 p.write_text(original)
