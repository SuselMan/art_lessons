from pathlib import Path
import difflib
root=Path('/home/suselman/projects/pencil-agents/680-water-wet-tone')
base=root/'docs/qa/harness/728-gl-queue-batch/owner-fifo-install.mjs'
s=base.read_text();n=s
n="import {installOwnedQaReuseHooks} from '../728-room-moment/OwnedQaReuseHooks.mjs';\nimport {diagnosticWebgl2Raw} from '../../../../apps/web/src/engine/src/raster/diagnosticWebgl2.ts';\n"+n
n=n.replace('diagnosticFloatPreview=false,previewBudgetBytes','diagnosticFloatPreview=false,qaReuseOwners=false,previewBudgetBytes')
n=n.replace(' const page=e._pageSize();'," if(qaReuseOwners&&diagnosticWebgl2Raw(e.gl))throw Error('Reuse requires dynamic WebGL1 routes');\n const page=e._pageSize();")
n=n.replace(' let preview=null,previewAdmissions=0;',' let reuse=null,lostTeardown=false;\n let preview=null,previewAdmissions=0;')
n=n.replace(' const previewLost=()=>preview?.handleContextLoss();if(diagnosticEarlyPreview)e.gl.canvas.addEventListener(\'webglcontextlost\',previewLost);', ''' const previewLost=()=>{
  preview?.handleContextLoss();
  if(!reuse||lostTeardown)return;
  if(!e.gl.isContextLost())throw Error('Lost listener without actual loss');
  lostTeardown=true;pool.closeLostGeneration();
  reuse.destroyLostGeneration({stopProducers:()=>preview?.handleContextLoss(),cancelFutureJobs:()=>{e._wcCanonical.cancel(true);coordinator.dispose();const active=coordinator.snapshot().active;if(active)coordinator.completeCancellation(active)},destroyOldPool:()=>pool.destroyLostGeneration()});
  owners.clear();preview?.disposeAfterFence();
 };
 if(diagnosticEarlyPreview||qaReuseOwners)e.gl.canvas.addEventListener('webglcontextlost',previewLost);
 if(qaReuseOwners)reuse=installOwnedQaReuseHooks({engine:e,generation:1,mainFree:()=>pool.free,previewFree:()=>diagnosticEarlyPreview?(preview?.freeSlots??0):3,conservativeGl:true,syncSites:[{target:e,name:'_syncContinuationGpu'}]});''')
n=n.replace('if(owner)morph?.retire(owner);source.retire()', 'if(!reuse&&owner)morph?.retire(owner);source.retire()')
n=n.replace('  map.set(gesture,owner);',"  if(reuse&&!reuse.track(owner,{detachPresentation:()=>{preview?.beforeRebase(owner);morph?.retire(owner);return{gpuWrites:false}},releasePreview:()=>{if(diagnosticEarlyPreview)preview.releaseRetiredOwnerAfterKnownIdle(owner)},hasFutureCpuJobs:()=>coordinator.snapshot().owners.some(entry=>entry.token===owner.token)}))throw Error('Reuse bundle capacity');\n  map.set(gesture,owner);")
n=n.replace('  if(disposed)return;','  if(disposed||lostTeardown)return;\n  if(qaReuseOwners&&e._opts.tool!==\'watercolor\'){status(\'Reuse supports watercolor dynamic WebGL1 only\');return}')
n=n.replace('(!preview||previewAdmissions>=3)','(!preview||(!reuse&&previewAdmissions>=3))')
n=n.replace("  if(pool.free===0)","  if(reuse&&!reuse.canAdmit()){status('Wait for existing GPU idle');return}\n  if(pool.free===0)")
# Preserve current float/manual/runtime return object; change only disposal sequence.
n=n.replace('disposed=true;preview?.disposeAfterFence();if(diagnosticEarlyPreview)e.gl.canvas.removeEventListener', 'disposed=true;if(e.gl.isContextLost()&&reuse&&!lostTeardown)previewLost();if(diagnosticEarlyPreview||qaReuseOwners)e.gl.canvas.removeEventListener')
n=n.replace('coordinator.dispose();if(!e.gl.isContextLost())e.gl.finish();const active=',"coordinator.dispose();const cert=reuse&&!lostTeardown?reuse.bundles.captureBeforeExistingSync():null;if(!e.gl.isContextLost()){e.gl.finish();if(reuse)reuse.bundles.afterExistingSyncReturns(cert,'gl.finish')}const active=")
n=n.replace('if(active)coordinator.completeCancellation(active);visualScratchPrewarm',"if(active)coordinator.completeCancellation(active);if(reuse&&!lostTeardown){reuse.bundles.afterExistingSyncReturns(cert,'gl.finish');reuse.uninstallAfterKnownIdle()}preview?.disposeAfterFence();visualScratchPrewarm")
n=n.replace('pool.disposeAfterFence();e._wcAsyncFinish','if(!lostTeardown)pool.disposeAfterFence();e._wcAsyncFinish')
patch=Path(__file__).with_name('actual-root-owner-reuse.patch')
poolpatch=Path(__file__).with_name('main-owner-lost-generation.patch').read_text()
patch.write_text(poolpatch+''.join(difflib.unified_diff(s.splitlines(True),n.splitlines(True),fromfile='a/docs/qa/harness/728-gl-queue-batch/owner-fifo-install.mjs',tofile='b/docs/qa/harness/728-gl-queue-batch/owner-fifo-install.mjs')))
# Fixture imports patched real class, same source role ownership implementation.
poolbase=root/'docs/qa/harness/728-gl-queue-batch/PrewarmedGlOwnerPool.ts'
ps=poolbase.read_text(); import subprocess
out=Path(__file__).parent/'generated-lost-pool.ts'
out.write_text(ps)
# Apply unified pool hunks through patch command into only own fixture.
subprocess.run(['patch',str(out)],input=poolpatch,text=True,check=True,capture_output=True)
out.write_text(out.read_text().replace("from './OwnedGlSourceFields'", "from '/home/suselman/projects/pencil-agents/680-water-wet-tone/docs/qa/harness/728-gl-queue-batch/OwnedGlSourceFields'"))
import re
# Current ROOT installer semantics, only import resolution redirected for offline fixture.
gpu=Path('/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch')
def resolve(m):
 path=m.group(1)
 if path=='../728-room-moment/OwnedQaReuseHooks.mjs':return "from './OwnedQaReuseHooks.mjs'"
 if path.startswith('.'):
  return "from '"+str((gpu/path).resolve())+"'"
 return m.group(0)
Path(__file__).with_name('generated-current-reuse-install.mjs').write_text(re.sub(r"from '([^']+)'",resolve,n))
