from pathlib import Path
import subprocess,os,json
root=Path('temp/494-wash-settle');q=Path('apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts');p=Path('apps/web/src/engine/src/raster/WatercolorSettlePlan.ts');qOriginal=q.read_text();pOriginal=p.read_text();results={}
try:
 old='if (this._settle) this.complete()';assert qOriginal.count(old)==2
 a,b=qOriginal.rsplit(old,1);q.write_text(a+'// controlled omission of recursive drain'+b)
 with (root/'mutation-queue-drain.log').open('w') as out:code=subprocess.run(['npx','vitest','run','--maxWorkers=1','apps/web/src/engine/index.settle.test.ts'],stdout=out,stderr=subprocess.STDOUT).returncode
 if code==0 or 'AssertionError' not in (root/'mutation-queue-drain.log').read_text():raise RuntimeError('recursive drain mutation missed')
 results['recursiveDrain']={'exit':code,'caught':'ordering assertion'};q.write_text(qOriginal)
 old='return { ops, finish }';assert pOriginal.count(old)==1
 p.write_text(pOriginal.replace(old,'return { ops, finish: () => {} }'))
 with (root/'mutation-copy-back.log').open('w') as out:code=subprocess.run(['npx','playwright','test','--config',str(root/'plan.config.ts'),'--project','chromium'],env=os.environ|{'E2E_PORT_OFFSET':'235','AB_LABEL':'after'},stdout=out,stderr=subprocess.STDOUT).returncode
 if code==0 or 'wet planner fixture did not move pigment' not in (root/'mutation-copy-back.log').read_text():raise RuntimeError('copy-back mutation missed')
 results['copyBack']={'exit':code,'caught':'wet planner fixture did not move pigment'}
finally:q.write_text(qOriginal);p.write_text(pOriginal)
(root/'mutation-results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results))
