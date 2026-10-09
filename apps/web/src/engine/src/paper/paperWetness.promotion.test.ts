import {expect,it,vi} from 'vitest'
import {PaperWetness} from './paperWetness'
function fixture(){const w=new PaperWetness();w.deposit('A',12,12,8,.8,100,false,.4);w.deposit('B',40,20,8,.5,130,false,.2);return w}
function gesture(w:PaperWetness){w.dropPending();w.drain('A',12,12,8,.3);w.deposit('A',16,12,8,.9,180,true,.7);w.deposit('A',24,12,8,.4,210,true,.3);w.commitPending(250)}
function raw(w:PaperWetness){return ['_layers','_pending','_drained','_peak','_peakAt','_box'].map(key=>structuredClone(Reflect.get(w,key)))}
function state(w:PaperWetness){return [0,100,200,300,50000].map(now=>({peak:w.peak(now),bounds:w.bounds(now),cellsA:w.cellsOf('A',now),cellsB:w.cellsOf('B',now),raster:w.rasterWetAndPool(-2,-2,1,12,12,now),nib:w.sampleUnderNib('A',16,12,12,now)}))}
it('promotes exact completed fork without clocks/redeposit, retaining live identity and invalidating older authority',()=>{
 const live=fixture(),identity=live,token=live.captureDiagnosticAuthority(),other=live.captureDiagnosticAuthority(),fork=PaperWetness.forkDiagnosticSnapshot(token.snapshot),oracle=fixture();gesture(fork);gesture(oracle)
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>{throw Error('clock')});const wall=vi.spyOn(Date,'now').mockImplementation(()=>{throw Error('clock')})
 try{live.promoteDiagnosticFork(token,fork)}finally{clock.mockRestore();wall.mockRestore()}
 expect(live).toBe(identity);expect(state(live)).toEqual(state(oracle));expect(raw(live)).toEqual(raw(oracle));expect(()=>live.validateDiagnosticAuthority(other)).toThrow();expect(()=>live.promoteDiagnosticFork(token,fork)).toThrow()
 fork.clear();expect(state(live)).toEqual(state(oracle))
})
it('same-cell live writes, foreign snapshot forks, pending and drained unfinished forks reject without live changes',()=>{
 for(const kind of ['stale','foreign','pending','drained','instance'] as const){const live=fixture(),token=live.captureDiagnosticAuthority();let fork=PaperWetness.forkDiagnosticSnapshot(token.snapshot)
  if(kind==='stale')live.deposit('A',12,12,8,.9,150)
  if(kind==='foreign')fork=PaperWetness.forkDiagnosticSnapshot(fixture().captureDiagnosticSnapshot())
  if(kind==='pending')fork.deposit('A',12,12,8,.5,180,true)
  if(kind==='drained')fork.drain('A',12,12,8,.2)
  const target=kind==='instance'?fixture():live,before=state(target);expect(()=>target.promoteDiagnosticFork(token,fork)).toThrow();expect(state(target)).toEqual(before);expect(()=>live.promoteDiagnosticFork(token,fork)).toThrow()
 }
})
it('preparation failure consumes authority without partially replacing live state',()=>{
 const live=fixture(),token=live.captureDiagnosticAuthority(),fork=PaperWetness.forkDiagnosticSnapshot(token.snapshot);gesture(fork);const before=raw(live)
 const prepare=vi.spyOn(fork as unknown as {_copyDiagnosticState():PaperWetness},'_copyDiagnosticState').mockImplementation(()=>{throw Error('allocation sentinel')})
 try{expect(()=>live.promoteDiagnosticFork(token,fork)).toThrow('allocation sentinel');expect(raw(live)).toEqual(before)}finally{prepare.mockRestore()}
 expect(()=>live.promoteDiagnosticFork(token,fork)).toThrow()
})
