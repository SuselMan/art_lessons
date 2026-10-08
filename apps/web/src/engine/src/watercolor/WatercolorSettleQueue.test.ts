import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { WatercolorSettleQueue, presentationStepOp, inheritSettleOpTags, contactPulseOp, frontStepOp } from './WatercolorSettleQueue'

function fixture() {
  const frames = new Map<number, FrameRequestCallback>()
  let serial = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const perf = { settleStart: 0, settleOps: 0, settleMs: 0 }
  const queue = new WatercolorSettleQueue({ beforeStart() {}, perf: () => perf,
    isDrawing: () => false, backlogSize: () => 0, backlogMax: () => 4,
    noteActivity() {}, scheduleFieldRelease() {} })
  const scratch = { live: false } as RibbonStrokeScratch
  const frame = () => { const [id, fn] = [...frames][0]; frames.delete(id); fn(performance.now()) }
  return { queue, scratch, frames, frame }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('drawing coroutine ownership', () => {
  it('resumes an owned empty recipient after the auxiliary first slice', () => {
    const f = fixture(), events: string[] = [], abort = vi.fn()
    f.queue.start(f.scratch, [() => {}, () => events.push('pigment')], () => events.push('finish'), { isAlive: () => true, abort })
    f.frame()
    expect(events).toEqual(['pigment', 'finish'])
    expect(abort).not.toHaveBeenCalled(); expect(f.queue.current).toBeNull()
  })
  it.each(['cancel', 'dead-frame', 'dead-complete'] as const)('closes a paused generator on %s without landing it', how => {
    const f = fixture(), cleanup = vi.fn(), finish = vi.fn()
    function* work() { try { yield; yield } finally { cleanup() } }
    const generator = work(); generator.next()
    let owned = true
    f.queue.start(f.scratch, [() => {}, () => generator.next()], finish, { isAlive: () => owned, abort: () => { generator.return() } })
    if (how === 'cancel') f.queue.cancel()
    else { owned = false; if (how === 'dead-frame') f.frame(); else f.queue.complete() }
    f.queue.cancel()
    expect(cleanup).toHaveBeenCalledTimes(1); expect(finish).not.toHaveBeenCalled()
    expect(f.queue.current).toBeNull(); expect(f.frames.size).toBe(0)
  })
  it('drains drawing and its chained solver completion in order', () => {
    const f = fixture(), events: string[] = [], abort = vi.fn()
    f.queue.start(f.scratch, [() => {}, () => events.push('draw')], () => {
      events.push('draw-finish'); Object.assign(f.scratch, { live: true })
      f.queue.start(f.scratch, [() => events.push('stitch'), () => events.push('diffuse')], () => events.push('solver-finish'))
    }, { isAlive: () => true, abort })
    f.queue.complete()
    expect(events).toEqual(['draw', 'draw-finish', 'stitch', 'diffuse', 'solver-finish'])
    expect(abort).not.toHaveBeenCalled(); expect(f.queue.current).toBeNull()
  })
  it('retains the dead-scratch guard for ordinary solver jobs', () => {
    const f = fixture(), op = vi.fn(), finish = vi.fn()
    f.queue.start(f.scratch, [() => {}, op], finish)
    f.frame()
    expect(op).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled(); expect(f.queue.current).toBeNull()
  })
})

describe('synchronous drain presentation gate', () => {
  it('preserves ordinary asynchronous previews and suppresses only the drain', () => {
    const f = fixture(), seen: boolean[] = []
    Object.assign(f.scratch, { live: true }); f.queue.suppressDrainPreview = true
    f.queue.start(f.scratch, [() => seen.push(f.queue.allowProgressPreview), () => seen.push(f.queue.allowProgressPreview), () => seen.push(f.queue.allowProgressPreview)], () => seen.push(f.queue.allowProgressPreview))
    f.frame(); f.queue.complete()
    expect(seen).toEqual([true, true, false, false])
    expect(f.queue.allowProgressPreview).toBe(true)
  })
  it('keeps nested jobs suppressed and restores the gate after a thrown pass', () => {
    const f = fixture(), seen: boolean[] = []
    Object.assign(f.scratch, { live: true }); f.queue.suppressDrainPreview = true
    f.queue.start(f.scratch, [() => {}, () => seen.push(f.queue.allowProgressPreview)], () => {
      f.queue.start(f.scratch, [() => seen.push(f.queue.allowProgressPreview), () => { seen.push(f.queue.allowProgressPreview); throw Error('pass failed') }], () => {})
    })
    expect(() => f.queue.complete()).toThrow('pass failed')
    expect(seen).toEqual([false, false, false])
    expect(f.queue.allowProgressPreview).toBe(true)
  })
  it('preserves default presentation even when completing synchronously', () => {
    const f = fixture(), seen: boolean[] = []
    Object.assign(f.scratch, { live: true })
    f.queue.start(f.scratch, [() => {}, () => seen.push(f.queue.allowProgressPreview)], () => seen.push(f.queue.allowProgressPreview))
    f.queue.complete()
    expect(seen).toEqual([true, true])
  })
})

 describe('captured presentation batching', () => {
  function setup() {
    const f = fixture(), events: string[] = [], sync = vi.fn()
    Object.assign(f.scratch, { live: true })
    Object.assign(f.queue, { ctx: { beforeStart() {}, perf: () => ({settleStart: 0, settleOps: 0, settleMs: 0}), isDrawing: () => false, backlogSize: () => 0, backlogMax: () => 4, noteActivity() {}, scheduleFieldRelease() {}, syncGpu: sync } })
    vi.spyOn(performance, 'now').mockReturnValue(1)
    return { ...f, events, sync }
  }
  it('defaults to one continuation and caps opt-in at four without crossing tokens', () => {
    const f = setup(), token = {}, other = {}
    const ops = [() => f.events.push('capture'), ...Array.from({length: 5}, (_, i) => presentationStepOp(() => f.events.push(String(i)), token)), presentationStepOp(() => f.events.push('other'), other)]
    f.queue.start(f.scratch, ops, () => f.events.push('finish'))
    f.frame(); expect(f.events).toEqual(['capture', '0'])
    f.queue.presentationBatchEnabled = true
    f.frame(); expect(f.events).toEqual(['capture', '0', '1', '2', '3', '4'])
    expect(f.sync).toHaveBeenCalledTimes(4)
    f.frame(); expect(f.events.at(-1)).toBe('finish')
  })
  it('inherits exact token through dynamic insertion and stops at upload', () => {
    const f = setup(), token = {}
    f.queue.presentationBatchEnabled = true
    const source = presentationStepOp(() => f.events.push('tile'), token)
    const wrapped = () => source(); inheritSettleOpTags(source, wrapped)
    const ops = [() => {}, presentationStepOp(() => { f.events.push('resume'); ops.splice(2, 0, wrapped) }, token), () => f.events.push('upload'), presentationStepOp(() => f.events.push('completion'), token)]
    f.queue.start(f.scratch, ops, () => {})
    f.frame(); expect(f.events).toEqual(['resume', 'tile'])
    f.frame(); expect(f.events.at(-1)).toBe('upload')
    f.frame(); expect(f.events.at(-1)).toBe('completion')
  })
  it('does not resume after cancellation inside a tile', () => {
    const f = setup(), token = {}, abort = vi.fn(), finish = vi.fn()
    f.queue.presentationBatchEnabled = true
    f.queue.start(f.scratch, [() => {}, presentationStepOp(() => { f.events.push('tile'); f.queue.cancel() }, token), presentationStepOp(() => f.events.push('forbidden'), token)], finish, { isAlive: () => true, abort })
    f.frame(); f.queue.cancel()
    expect(f.events).toEqual(['tile']); expect(abort).toHaveBeenCalledTimes(1); expect(finish).not.toHaveBeenCalled()
  })
  it('stops after a synchronized unit consumes the four millisecond budget', () => {
    const f = setup(), token = {}; let clock = 1
    vi.mocked(performance.now).mockImplementation(() => clock)
    f.sync.mockImplementation(() => { clock += 4 })
    f.queue.presentationBatchEnabled = true
    f.queue.start(f.scratch, [() => {}, ...Array.from({length: 4}, (_, i) => presentationStepOp(() => f.events.push(String(i)), token))], () => {})
    f.frame(); expect(f.events).toEqual(['0']); expect(f.sync).toHaveBeenCalledTimes(1)
  })
  it('stops when a tile callback retires the owner and aborts only once', () => {
    const f = setup(), token = {}, abort = vi.fn(), finish = vi.fn(); let alive = true
    f.queue.presentationBatchEnabled = true
    f.queue.start(f.scratch, [() => {}, presentationStepOp(() => { f.events.push('tile'); alive = false }, token), presentationStepOp(() => f.events.push('forbidden'), token)], finish, { isAlive: () => alive, abort })
    f.frame(); f.queue.cancel()
    expect(f.events).toEqual(['tile']); expect(abort).toHaveBeenCalledTimes(1); expect(finish).not.toHaveBeenCalled()
  })

  it('keeps one unit while drawing even with an identical presentation token', () => {
    const f = setup(), token = {}
    Object.assign(f.queue, { ctx: { beforeStart() {}, perf: () => ({settleStart: 0, settleOps: 0, settleMs: 0}), isDrawing: () => true, backlogSize: () => 0, backlogMax: () => 4, noteActivity() {}, scheduleFieldRelease() {}, syncGpu: f.sync } })
    f.queue.presentationBatchEnabled = true
    f.queue.start(f.scratch, [() => {}, ...Array.from({length: 3}, (_, i) => presentationStepOp(() => f.events.push(String(i)), token))], () => {})
    f.frame(); expect(f.events).toEqual(['0']); expect(f.sync).not.toHaveBeenCalled()
  })

})


describe('budgeted continuation task ownership', () => {
  function taskFixture() {
    vi.useFakeTimers()
    const f = fixture(), sync = vi.fn(), abort = vi.fn(), calls: number[] = []
    let drawing = false
    const ctx = (f.queue as unknown as { ctx: { syncGpu: () => void; canonicalBacklogSize: () => number; isDrawing: () => boolean } }).ctx
    ctx.syncGpu = sync; ctx.canonicalBacklogSize = () => 3; ctx.isDrawing = () => drawing
    vi.stubGlobal('scheduler', undefined)
    f.queue.continuationTasksEnabled = true
    f.queue.start(f.scratch, Array.from({ length: 30 }, (_, i) => () => calls.push(i)), () => calls.push(99), { isAlive: () => true, abort })
    return { ...f, calls, sync, abort, draw: () => { drawing = true } }
  }
  afterEach(() => vi.useRealTimers())
  it('retains exact order and forces a frame after two bounded tasks', () => {
    const f = taskFixture(); f.frame()
    expect(f.calls).toEqual([0, 1, 2, 3, 4])
    vi.runAllTimers()
    expect(f.calls).toEqual(Array.from({ length: 13 }, (_, i) => i))
    expect(f.sync).toHaveBeenCalledTimes(12)
    expect(f.frames.size).toBe(1)
    f.queue.complete(); expect(f.calls).toEqual([...Array.from({ length: 30 }, (_, i) => i), 99])
    vi.runAllTimers(); expect(f.calls).toHaveLength(31)
  })
  it('cancels the pending task before an ownership abort without late writes', () => {
    const f = taskFixture(); f.frame(); f.queue.cancel(); vi.runAllTimers()
    expect(f.calls).toEqual([0, 1, 2, 3, 4]); expect(f.frames.size).toBe(0)
  })
  it('yields to new input between continuation tasks', () => {
    const f = taskFixture(); f.frame(); f.draw(); vi.runAllTimers()
    expect(f.calls).toEqual([0, 1, 2, 3, 4]); expect(f.frames.size).toBe(1)
    f.queue.cancel()
  })
  it('fences the final submitted unit before ending its budget', () => {
    const f = taskFixture(); f.queue.complete(); f.calls.length = 0; f.sync.mockClear()
    f.queue.start(f.scratch, [() => f.calls.push(0), () => f.calls.push(1)], () => f.calls.push(2), { isAlive: () => true, abort() {} })
    f.frame(); expect(f.calls).toEqual([0, 1, 2]); expect(f.sync).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps default OFF on the old one-unit animation-frame policy', () => {
    const f = taskFixture(); f.queue.continuationTasksEnabled = false; f.frame()
    expect(f.calls).toEqual([0, 1]); expect(f.sync).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
    f.queue.cancel()
  })
  it('aborts postTask ownership before an obsolete callback can write', () => {
    const f = taskFixture(); let callback: (() => void) | undefined; let signal: AbortSignal | undefined
    vi.stubGlobal('scheduler', { postTask: (fn: () => void, options: { signal: AbortSignal }) => { callback = fn; signal = options.signal; return new Promise(() => {}) } })
    f.frame(); f.queue.cancel(); expect(signal?.aborted).toBe(true); callback?.()
    expect(f.calls).toEqual([0, 1, 2, 3, 4])
  })
  it('returns to the animation-frame policy when postTask rejects', async () => {
    const f = taskFixture(); vi.stubGlobal('scheduler', { postTask: () => Promise.reject(Error('unsupported')) })
    f.frame(); await Promise.resolve(); await Promise.resolve()
    expect(f.frames.size).toBe(1); expect(f.calls).toHaveLength(5); f.queue.cancel()
  })
  it('does not execute an old continuation after replacing its job', () => {
    const f = taskFixture(); f.frame(); const newCalls: string[] = []
    f.queue.start(f.scratch, [() => newCalls.push('capture'), () => newCalls.push('new')], () => newCalls.push('finish'), { isAlive: () => true, abort() {} })
    expect(f.calls.at(-1)).toBe(99); vi.runAllTimers(); expect(newCalls).toEqual(['capture'])
    f.frame(); expect(newCalls).toEqual(['capture', 'new', 'finish'])
  })
  it('stops after loss inside a submitted unit and closes the owned work', () => {
    const f = taskFixture(); f.queue.complete(); f.calls.length = 0; f.sync.mockClear(); let alive = true; const abort = vi.fn()
    f.queue.start(f.scratch, [() => f.calls.push(0), () => { f.calls.push(1); alive = false }, () => f.calls.push(2)], () => f.calls.push(3), { isAlive: () => alive, abort })
    f.frame(); expect(f.calls).toEqual([0, 1]); expect(f.sync).toHaveBeenCalledTimes(1)
    vi.runAllTimers(); f.frame(); expect(abort).toHaveBeenCalledTimes(1); expect(f.calls).toEqual([0, 1])
  })

  it('reports an actual continuation failure and cancels owned work instead of retrying', () => {
    const f = taskFixture(), failed = vi.fn()
    const ctx = (f.queue as unknown as { ctx: { continuationSyncGpu: () => void; continuationFailed: (error: unknown) => void } }).ctx
    ctx.continuationFailed = failed
    f.frame(); ctx.continuationSyncGpu = () => { throw Error('completion fence failed') }
    vi.runAllTimers()
    expect(failed).toHaveBeenCalledOnce(); expect(String(failed.mock.calls[0][0])).toContain('completion fence failed')
    expect(f.queue.current).toBeNull(); expect(f.frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0)
    expect(f.calls).toEqual([0, 1, 2, 3, 4, 5]); expect(f.abort).toHaveBeenCalledOnce()
  })
  it('surfaces an actual frame-run failure when no error owner is installed', () => {
    const f = taskFixture()
    const ctx = (f.queue as unknown as { ctx: { continuationSyncGpu: () => void } }).ctx
    ctx.continuationSyncGpu = () => { throw Error('clock failure') }
    expect(() => f.frame()).toThrow('clock failure'); expect(f.queue.current).toBeNull()
    vi.runAllTimers(); expect(f.calls).toEqual([0, 1])
  })

})

it('old scheduling failure preserves a successor started by complete and aborts only the old lifecycle',()=>{
 const f=fixture(),oldAbort=vi.fn(),newAbort=vi.fn(),newOp=vi.fn();Object.assign(f.scratch,{live:true})
 const nextScratch={live:true} as RibbonStrokeScratch
 const failure=Error('old scheduling failure');const ctx=f.queue['ctx'];vi.spyOn(ctx,'scheduleFieldRelease').mockImplementationOnce(()=>{throw failure})
 f.queue.start(f.scratch,[()=>{},()=>{}],()=>f.queue.start(nextScratch,[()=>{},newOp],()=>{},{isAlive:()=>true,abort:newAbort}),{isAlive:()=>true,abort:oldAbort})
 expect(()=>f.queue.advance()).toThrow(failure);expect(f.queue.current?.scratch).toBe(nextScratch);expect(oldAbort).toHaveBeenCalledExactlyOnceWith(failure);expect(newAbort).not.toHaveBeenCalled()
 f.queue.complete();expect(newOp).toHaveBeenCalledOnce();expect(newAbort).not.toHaveBeenCalled()
})
it('operator and abort failures retain the original cause and cleanup error explicitly',()=>{
 const f=fixture(),error=Error('physical'),cleanup=Error('cleanup');Object.assign(f.scratch,{live:true})
 f.queue.start(f.scratch,[()=>{},()=>{throw error}],()=>{},{isAlive:()=>true,abort:()=>{throw cleanup}})
 try{f.queue.advance();expect.fail('must fail')}catch(e){expect(e).toBeInstanceOf(AggregateError);expect((e as AggregateError).cause).toBe(error);expect((e as AggregateError).errors).toEqual([error,cleanup])}
 expect(f.queue.current).toBeNull()
})

it('dead-owner cleanup throwing cannot invoke abort twice through the advance catch',()=>{
 const f=fixture(),cleanup=Error('abort'),abort=vi.fn(()=>{throw cleanup});let alive=true
 f.queue.start(f.scratch,[()=>{},()=>{}],()=>{},{isAlive:()=>alive,abort});alive=false
 expect(()=>f.queue.advance()).toThrow(cleanup);expect(abort).toHaveBeenCalledOnce();expect(f.queue.current).toBeNull()
})


describe('bounded diagnostic solver batching', () => {
 function solverFixture(){
  const f=fixture(),events:string[]=[];let time=100,drawing=false
  vi.spyOn(performance,'now').mockImplementation(()=>time)
  const sync=vi.fn(()=>{events.push('sync');time+=1})
  Object.assign(f.queue,{ctx:{beforeStart(){},perf:()=>({settleStart:0,settleOps:0,settleMs:0}),isDrawing:()=>drawing,backlogSize:()=>0,backlogMax:()=>4,noteActivity(){},scheduleFieldRelease(){},syncGpu:sync}})
  Object.assign(f.scratch,{live:true});return{...f,events,sync,setDrawing:(v:boolean)=>{drawing=v},addTime:(n:number)=>{time+=n}}
 }
 it('default performs one unit; ON preserves original operation order and every Q8 boundary',()=>{
  const execute=(enabled:boolean)=>{const f=solverFixture();f.queue.diagnosticSolverBatchEnabled=enabled;let q8=31;const results:number[]=[]
   const ops=[()=>{},...Array.from({length:8},(_,i)=>contactPulseOp(()=>{q8=Math.round((q8*0.71+i*5.3)%256);results.push(q8)}))]
   f.queue.start(f.scratch,ops,()=>results.push(q8));f.frame();const firstCount=results.length;while(f.queue.current)f.frame();return{results,firstCount,syncs:f.sync.mock.calls.length}}
  const off=execute(false),on=execute(true);expect(off.results).toEqual(on.results);expect(off.firstCount).toBe(1);expect(on.firstCount).toBe(4);expect(off.syncs).toBe(0);expect(on.syncs).toBe(8)
 })
 it('never crosses capture/upload, class change or presentation token barriers',()=>{
  const f=solverFixture();f.queue.diagnosticSolverBatchEnabled=true;const c=(v:string)=>contactPulseOp(()=>f.events.push(v)),p=(v:string)=>frontStepOp(()=>f.events.push(v))
  f.queue.start(f.scratch,[()=>f.events.push('capture'),c('c1'),c('c2'),()=>f.events.push('upload'),p('f1'),p('f2'),presentationStepOp(()=>f.events.push('reveal'),{})],()=>f.events.push('finish'))
  f.frame();expect(f.events).toEqual(['capture','c1','sync','c2','sync']);f.frame();expect(f.events.at(-1)).toBe('upload');f.frame();expect(f.events.slice(-4)).toEqual(['f1','sync','f2','sync']);f.frame();expect(f.events.slice(-2)).toEqual(['reveal','finish'])
 })
 it('bounds synced wall budget and drawing admission without swallowing pending work',()=>{
  const f=solverFixture();f.queue.diagnosticSolverBatchEnabled=true;f.sync.mockImplementation(()=>{f.events.push('sync');f.addTime(3)})
  f.queue.start(f.scratch,[()=>{},...Array.from({length:7},(_,i)=>contactPulseOp(()=>f.events.push(String(i))))],()=>{})
  f.frame();expect(f.sync).toHaveBeenCalledTimes(3);f.setDrawing(true);f.frame();expect(f.events.at(-1)).toBe('3');expect(f.sync).toHaveBeenCalledTimes(3)
 })
 it('stops after ownership loss, throwing operator or cancellation',()=>{
  const f=solverFixture();f.queue.diagnosticSolverBatchEnabled=true;const abort=vi.fn(),finish=vi.fn();f.queue.start(f.scratch,[()=>{},contactPulseOp(()=>{f.events.push('first');f.queue.cancel()}),contactPulseOp(()=>f.events.push('forbidden'))],finish,{isAlive:()=>true,abort});f.frame();expect(f.events).not.toContain('forbidden');expect(abort).toHaveBeenCalledTimes(1);expect(finish).not.toHaveBeenCalled()
 })
})
