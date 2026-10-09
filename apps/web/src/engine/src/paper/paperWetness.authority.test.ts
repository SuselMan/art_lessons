import {expect,it} from 'vitest'
import {PaperWetness,type DiagnosticWetAuthority} from './paperWetness'
function raw(w:PaperWetness){return ['_layers','_pending','_drained','_peak','_peakAt','_box'].map(k=>structuredClone(Reflect.get(w,k)))}
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
it('other six mutators conservatively invalidate even no-op calls without changing legacy snapshot forks',()=>{
 const mutate=[(w:PaperWetness)=>w.deposit('L',0,0,1,0,0),(w:PaperWetness)=>w.drain('L',0,0,1,0),(w:PaperWetness)=>w.commitPending(0),(w:PaperWetness)=>w.dropPending(),(w:PaperWetness)=>w.forgetLayer('absent'),(w:PaperWetness)=>w.clear()]
 for(const fn of mutate){const w=fixture(),token=w.captureDiagnosticAuthority();fn(w);expect(()=>w.validateDiagnosticAuthority(token)).toThrow();expect(()=>w.validateDiagnosticAuthority(token)).toThrow();expect(()=>PaperWetness.forkDiagnosticSnapshot(token.snapshot)).not.toThrow()}
})
it('foreign instance, forged schema and reused capability reject fail closed',()=>{
 const a=fixture(),b=fixture(),token=a.captureDiagnosticAuthority();expect(()=>b.validateDiagnosticAuthority(token)).toThrow();expect(()=>a.validateDiagnosticAuthority(token)).toThrow()
 expect(()=>a.validateDiagnosticAuthority({version:2,snapshot:a.captureDiagnosticSnapshot()} as unknown as DiagnosticWetAuthority)).toThrow()
})

it('unchanged raw prune keeps authority; expired deletion and stale bounds repair invalidate with original behavior',()=>{
 const unchanged=fixture(),token=unchanged.captureDiagnosticAuthority();unchanged.prune(0);expect(()=>unchanged.validateDiagnosticAuthority(token)).not.toThrow()
 for(const kind of ['expired','bounds'] as const){const live=fixture();if(kind==='bounds'){live.deposit('L',200,200,8,.9,150,true);live.dropPending()}
  const authority=live.captureDiagnosticAuthority(),oracle=PaperWetness.forkDiagnosticSnapshot(authority.snapshot),before=live.bounds(0),now=kind==='expired'?200000:0
  live.prune(now);oracle.prune(now);expect(raw(live)).toEqual(raw(oracle));expect(live.bounds(now)).toEqual(oracle.bounds(now));expect(live.rasterWetAndPool(-2,-2,1,32,32,now)).toEqual(oracle.rasterWetAndPool(-2,-2,1,32,32,now));expect(live.captureDiagnosticSnapshot().recordCount).toBe(oracle.captureDiagnosticSnapshot().recordCount)
  if(kind==='bounds')expect(live.bounds(now)).not.toEqual(before)
  expect(()=>live.validateDiagnosticAuthority(authority)).toThrow()
 }
 const empty=new PaperWetness(),authority=empty.captureDiagnosticAuthority();empty.prune(0);expect(()=>empty.validateDiagnosticAuthority(authority)).not.toThrow()
})
