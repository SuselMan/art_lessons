from pathlib import Path
import subprocess,os
p=Path('apps/web/src/engine/src/raster/RibbonPasses.ts');original=p.read_text()
try:
 p.write_text(original.replace('    this.gl.deleteBuffer(this._ribbonBuf)','    // QA control: deliberately retain vertex buffer',1))
 with open('temp/494-ribbon-passes/mutation.log','w') as f:
  r=subprocess.run(['npx','playwright','test','--config','temp/494-ribbon-passes/ab.config.ts','--grep','bounded'],env=dict(os.environ,AB_LABEL='mutation',E2E_GL='swiftshader',E2E_PORT_OFFSET='233'),stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode and 'ribbon GPU resource retained after destroy' in Path('temp/494-ribbon-passes/mutation.log').read_text(), 'Control mutation was not detected for expected reason'
 print('Control detected: ribbon GPU resource retained after destroy')
finally:
 p.write_text(original)
