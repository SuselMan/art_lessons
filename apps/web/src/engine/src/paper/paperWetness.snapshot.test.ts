import {expect,it,vi} from 'vitest'
import {PaperWetness} from './paperWetness'
function fixture(){const w=new PaperWetness();w.deposit('L1',12,12,8,.8,100,false,.4);w.deposit('L2',40,20,8,.6,130,false,.2);w.drain('L1',12,12,8,.3);w.deposit('L1',24,12,8,.9,170,true,.7);return w}
function observe(w:PaperWetness,now:number){return {peak:w.peak(now),bounds:w.bounds(now),sample:w.sample('L1',12,12,now),nib:w.sampleUnderNib('L1',16,12,16,now),cells:w.cellsOf('L1',now),count:w.countWet('L2',now,.1),raster:w.rasterWetAndPool(-2,-2,1,12,12,now)}}
it('snapshot preserves committed/pending/pool/drained/peak/bounds exactly with recorded times and no clock reads',()=>{
 const live=fixture(),before=observe(live,180);const now=vi.spyOn(performance,'now').mockImplementation(()=>{throw Error('clock forbidden')});const wall=vi.spyOn(Date,'now').mockImplementation(()=>{throw Error('clock forbidden')})
 try{const token=live.captureDiagnosticSnapshot(),fork=PaperWetness.forkDiagnosticSnapshot(token);expect(observe(fork,180)).toEqual(before);expect(observe(live,180)).toEqual(before)
  // Re-drain must remember the already drunk cells, not drain them twice.
  for(const w of [live,fork]){w.drain('L1',12,12,8,.3);w.commitPending(200)}expect(observe(fork,220)).toEqual(observe(live,220))
  live.clear();expect(observe(PaperWetness.forkDiagnosticSnapshot(token),180)).toEqual(before);expect(observe(fork,220)).not.toEqual(observe(live,220))
 }finally{now.mockRestore();wall.mockRestore()}
})
it('independent forks retain original cell timestamps across future and late reads without implicit decay/pruning',()=>{
 const live=fixture(),token=live.captureDiagnosticSnapshot(),a=PaperWetness.forkDiagnosticSnapshot(token),b=PaperWetness.forkDiagnosticSnapshot(token)
 for(const t of [0,100,170,500,50000])expect(observe(a,t)).toEqual(observe(live,t))
 a.dropPending();a.forgetLayer('L2');expect(observe(b,180)).toEqual(observe(live,180));expect(observe(a,180)).not.toEqual(observe(b,180))
})
it('capacity and opaque schema identity fail closed, DEV-only and capture leaves source untouched',()=>{
 const live=fixture(),before=observe(live,180);expect(()=>live.captureDiagnosticSnapshot(0)).toThrow('capacity');expect(observe(live,180)).toEqual(before);for(const bound of [-1,.5,65537])expect(()=>live.captureDiagnosticSnapshot(bound)).toThrow('bound')
 const token=live.captureDiagnosticSnapshot();expect(token.cellCount).toBeGreaterThan(0);expect(token.recordCount).toBeGreaterThan(token.cellCount);expect(()=>PaperWetness.forkDiagnosticSnapshot({...token})).toThrow('Unknown')
 vi.stubEnv('DEV',false);try{expect(()=>live.captureDiagnosticSnapshot()).toThrow('DEV-only');expect(()=>PaperWetness.forkDiagnosticSnapshot(token)).toThrow('DEV-only')}finally{vi.unstubAllEnvs()}
})
it('fork follows original exact model operations with explicit nonmonotonic per-batch times and pool changes',()=>{
 for(let seed=1;seed<=12;seed++){
  const live=fixture(),fork=PaperWetness.forkDiagnosticSnapshot(live.captureDiagnosticSnapshot());let state=seed
  const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
  for(let batch=0;batch<16;batch++){
   const now=Math.floor(next()*1600),layer=next()<.5?'L1':'L2',x=Math.floor(next()*6)*8,y=Math.floor(next()*4)*8,amount=next(),pool=next(),kind=Math.floor(next()*5)
   const apply=(w:PaperWetness)=>{switch(kind){case 0:w.deposit(layer,x,y,8,amount,now,false,pool);break;case 1:w.deposit(layer,x,y,8,amount,now,true,pool);break;case 2:w.drain(layer,x,y,8,amount);break;case 3:w.commitPending(now);break;default:w.dropPending()}}
   apply(live);apply(fork);expect(observe(fork,now)).toEqual(observe(live,now));expect(observe(fork,now+200)).toEqual(observe(live,now+200))
  }
 }
})
