import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { WatercolorSettleQueue } from './WatercolorSettleQueue'

function fixture() {
  const frames = new Map<number, FrameRequestCallback>()
  let serial = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const perf = { settleStart: 0, settleOps: 0, settleMs: 0 }
  const queue = new WatercolorSettleQueue({ beforeStart() {}, perf: () => perf,
    isDrawing: () => false, backlogSize: () => 0, backlogMax: () => 4,
    noteActivity() {}, scheduleFieldRelease() {}, syncGpu() {} })
  const scratch = { live: false } as RibbonStrokeScratch
  const frame = () => { const [id, fn] = [...frames][0]; frames.delete(id); fn(performance.now()) }
  return { queue, scratch, frames, frame }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe.each([false, true])('drawing coroutine ownership (idleBatch=%s)', idleBatch => {
  const ownedFixture = () => { const f = fixture(); f.queue.idleBatch = idleBatch; return f }
  it('resumes an owned empty recipient after the auxiliary first slice', () => {
    const f = ownedFixture(), events: string[] = [], abort = vi.fn()
    f.queue.start(f.scratch, [() => {}, () => events.push('pigment')], () => events.push('finish'), { isAlive: () => true, abort })
    f.frame()
    expect(events).toEqual(['pigment', 'finish'])
    expect(abort).not.toHaveBeenCalled(); expect(f.queue.current).toBeNull()
  })
  it.each(['cancel', 'dead-frame', 'dead-complete'] as const)('closes a paused generator on %s without landing it', how => {
    const f = ownedFixture(), cleanup = vi.fn(), finish = vi.fn()
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
    const f = ownedFixture(), events: string[] = [], abort = vi.fn()
    f.queue.start(f.scratch, [() => {}, () => events.push('draw')], () => {
      events.push('draw-finish'); Object.assign(f.scratch, { live: true })
      f.queue.start(f.scratch, [() => events.push('stitch'), () => events.push('diffuse')], () => events.push('solver-finish'))
    }, { isAlive: () => true, abort })
    f.queue.complete()
    expect(events).toEqual(['draw', 'draw-finish', 'stitch', 'diffuse', 'solver-finish'])
    expect(abort).not.toHaveBeenCalled(); expect(f.queue.current).toBeNull()
  })
  it('retains the dead-scratch guard for ordinary solver jobs', () => {
    const f = ownedFixture(), op = vi.fn(), finish = vi.fn()
    f.queue.start(f.scratch, [() => {}, op], finish)
    f.frame()
    expect(op).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled(); expect(f.queue.current).toBeNull()
  })
})
