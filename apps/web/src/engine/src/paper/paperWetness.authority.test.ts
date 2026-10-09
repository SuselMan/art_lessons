import {expect,it} from 'vitest'
import {PaperWetness,type DiagnosticWetAuthority} from './paperWetness'
function fixture(){const w=new PaperWetness();w.deposit('L',12,12,8,.8,100,false,.4);return w}
it('unchanged live read queries and independent fork permit exactly one validation',()=>{
 const w=fixture(),token=w.captureDiagnosticAuthority();const fork=PaperWetness.forkDiagnosticSnapshot(token.snapshot)
 w.sample('L',12,12,500);w.sampleUnderNib('L',12,12,8,500);w.anyWetNear('L',12,12,8,500);w.anyWet('L',500);w.peak(500);w.bounds(500);w.rasterWetAndPool(0,0,1,4,4,500);w.cellsOf('L',500)
 fork.clear();expect(()=>w.validateDiagnosticAuthority(token)).not.toThrow();expect(()=>w.validateDiagnosticAuthority(token)).toThrow()
})
it('same identity cell write with unchanged count invalidates authority and preserves captured snapshot',()=>{
 const w=fixture(),token=w.captureDiagnosticAuthority(),count=w.captureDiagnosticSnapshot().cellCount
 w.deposit('L',12,12,8,.9,200,false,.7)
 expect(w.captureDiagnosticSnapshot().cellCount).toBe(count);expect(()=>w.validateDiagnosticAuthority(token)).toThrow()
 expect(PaperWetness.forkDiagnosticSnapshot(token.snapshot).sample('L',12,12,100)).toBe(.8)
})
it('every mutator conservatively invalidates even no-op calls without changing legacy snapshot forks',()=>{
 const mutate=[(w:PaperWetness)=>w.deposit('L',0,0,1,0,0),(w:PaperWetness)=>w.drain('L',0,0,1,0),(w:PaperWetness)=>w.commitPending(0),(w:PaperWetness)=>w.dropPending(),(w:PaperWetness)=>w.prune(0),(w:PaperWetness)=>w.forgetLayer('absent'),(w:PaperWetness)=>w.clear()]
 for(const fn of mutate){const w=fixture(),token=w.captureDiagnosticAuthority();fn(w);expect(()=>w.validateDiagnosticAuthority(token)).toThrow();expect(()=>w.validateDiagnosticAuthority(token)).toThrow();expect(()=>PaperWetness.forkDiagnosticSnapshot(token.snapshot)).not.toThrow()}
})
it('foreign instance, forged schema and reused capability reject fail closed',()=>{
 const a=fixture(),b=fixture(),token=a.captureDiagnosticAuthority();expect(()=>b.validateDiagnosticAuthority(token)).toThrow();expect(()=>a.validateDiagnosticAuthority(token)).toThrow()
 expect(()=>a.validateDiagnosticAuthority({version:2,snapshot:a.captureDiagnosticSnapshot()} as unknown as DiagnosticWetAuthority)).toThrow()
})
