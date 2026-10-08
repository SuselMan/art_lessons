import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=process.cwd(),dir=path.join(root,'temp/device-runs'),source=path.join(root,'apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts');
let queue=fs.readFileSync(source,'utf8');const baseline=queue;
const replace=(a,b)=>{if(queue.split(a).length!==2)throw Error('CPU queue frozen seam mismatch '+a);queue=queue.replace(a,b)};
replace('const contactPulses =',`const cpuPrepareOps = new WeakSet<() => void>()
/** Pure CPU geometry/raster continuation; upload/copy/GPU commands are forbidden. */
export function cpuPrepareOp(op: () => void): () => void { cpuPrepareOps.add(op); return op }
const contactPulses =`);
replace('  if (contactPulses.has(source))', '  if (cpuPrepareOps.has(source)) cpuPrepareOps.add(wrapped)\n  if (contactPulses.has(source))');
replace("'contact' | 'front' | 'presentation' | 'barrier'", "'cpu-prepare' | 'contact' | 'front' | 'presentation' | 'barrier'");
replace("  if (contactPulses.has(op)) return 'contact'", "  if (cpuPrepareOps.has(op)) return 'cpu-prepare'\n  if (contactPulses.has(op)) return 'contact'");
replace('  diagnosticSolverBatchEnabled = false',`  diagnosticSolverBatchEnabled = false
  diagnosticCpuPrepareBatchEnabled = false
  readonly diagnosticCpuPrepareCounts = { ticks: 0, units: 0, elapsedMs: 0, maxMs: 0 }`);
replace('      const batchable =',`      if (this.diagnosticCpuPrepareBatchEnabled && !late && !this.ctx.isDrawing() && cpuPrepareOps.has(s.ops[s.next])) {
        const at = performance.now()
        this.diagnosticCpuPrepareCounts.ticks++
        for (let n = 0; n < 4 && this._settle === s && cpuPrepareOps.has(s.ops[s.next]); n++) {
          this.advance()
          this.diagnosticCpuPrepareCounts.units++
          if (performance.now() - at >= 8 || this.ctx.isDrawing() || !this.isAlive(s)) break
        }
        const elapsed = performance.now() - at
        this.diagnosticCpuPrepareCounts.elapsedMs += elapsed
        this.diagnosticCpuPrepareCounts.maxMs = Math.max(this.diagnosticCpuPrepareCounts.maxMs, elapsed)
        break // Never cross a following upload/contact/capture barrier.
      }
      const batchable =`);
queue=queue.replace("from '../buffers/RibbonStrokeScratch'", "from '../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'");
fs.writeFileSync(path.join(dir,'CpuPrepareSettleQueue.ts'),queue);
let plan=fs.readFileSync(path.join(dir,'CanonicalLazyContacts.ts'),'utf8');
plan=plan.replace('import { contactPulseOp,','import { cpuPrepareOp, contactPulseOp,').replace("from '../../apps/web/src/engine/src/watercolor/WatercolorSettleQueue'","from './CpuPrepareSettleQueue'");
for(const a of ['queuedContinuation.push(advanceField)','ops.push(advanceField)']){if(plan.split(a).length!==2)throw Error('CPU-only tag seam missing');plan=plan.replace(a,a.replace('advanceField','cpuPrepareOp(advanceField)'))}
fs.writeFileSync(path.join(dir,'CanonicalCpuContacts.ts'),plan);
const sha=s=>createHash('sha256').update(s).digest('hex');fs.writeFileSync(path.join(dir,'cpu-prepare-edits.json'),JSON.stringify({sourceSHA:sha(baseline),queueSHA:sha(queue),planSHA:sha(plan),productionModified:false},null,2));
