import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { WatercolorSettleQueue, presentationStepOp, inheritSettleOpTags } from './WatercolorSettleQueue'

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
