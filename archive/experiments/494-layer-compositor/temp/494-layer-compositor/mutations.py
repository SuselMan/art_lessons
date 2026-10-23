from pathlib import Path
import subprocess,json
p=Path('apps/web/src/engine/src/raster/LayerCompositor.ts'); original=p.read_text(); results={}
try:
 p.write_text(original.replace('this._splitCacheDirty = true\n  }','this._splitCacheDirty = false\n  }'))
 with open('temp/494-layer-compositor/mutation-dirty.log','w') as f: r=subprocess.run('npx vitest run --maxWorkers=1 apps/web/src/engine/index.recompositeCache.test.ts',shell=True,stdout=f,stderr=subprocess.STDOUT)
 results['omitInvalidation']=r.returncode;assert r.returncode!=0,'dirty mutation survived'
 p.write_text(original.replace('if (aboveItems.length) {','if (false && aboveItems.length) {'))
 with open('temp/494-layer-compositor/mutation-above.log','w') as f: r=subprocess.run('E2E_PORT_OFFSET=237 AB_LABEL=mutation npx playwright test --config temp/494-layer-compositor/ab.config.ts --project chromium --grep bounded',shell=True,stdout=f,stderr=subprocess.STDOUT)
 results['omitAboveCache']=r.returncode;assert r.returncode!=0,'above cache mutation survived'
finally:
 p.write_text(original)
 Path('temp/494-layer-compositor/mutation-results.json').write_text(json.dumps(results,indent=2))
print(results)
