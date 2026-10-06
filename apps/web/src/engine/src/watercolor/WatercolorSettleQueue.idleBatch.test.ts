import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { smallSettleOperation, WatercolorSettleQueue } from './WatercolorSettleQueue'

function fixture() {
  let clock = 100, drawing = false
  const frames = new Map<number, FrameRequestCallback>()
  let serial = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const events: string[] = []
  const perf = { settleStart: 0, settleOps: 0, settleMs: 0 }
  const sync = vi.fn(() => { events.push('gpu'); clock += 1 })
  const queue = new WatercolorSettleQueue({ beforeStart() {}, perf: () => perf,
    isDrawing: () => drawing, backlogSize: () => 0, backlogMax: () => 4,
    noteActivity() {}, scheduleFieldRelease() {}, syncGpu: sync })
  const scratch = { live: true } as RibbonStrokeScratch
  const runFrame = () => { const [id, fn] = [...frames][0]; frames.delete(id); clock += 16; fn(clock) }
  const small = (name: string, pixels = 100) => smallSettleOperation(() => events.push(name), () => ({ draws: 5, pixels }))
  return { queue, scratch, frames, events, sync, runFrame, small, drawing: () => { drawing = true } }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('bounded idle settle experiment', () => {
  it('keeps default scheduling and unknown phase boundaries', () => {
    const f = fixture()
    f.queue.start(f.scratch, [() => f.events.push('capture'), f.small('a'), f.small('b')], () => f.events.push('done'))
    f.runFrame()
    expect(f.events).toEqual(['capture', 'a'])
    expect(f.sync).not.toHaveBeenCalled()
    f.queue.idleBatch = true
    f.runFrame()
    expect(f.events).toEqual(['capture', 'a', 'b', 'done', 'gpu'])
  })
  it('preserves chronological operations while stopping before unknown/full-field work', () => {
    const f = fixture(); f.queue.idleBatch = true
    f.queue.start(f.scratch, [() => {}, f.small('a'), f.small('b'), () => f.events.push('full'), f.small('c')], () => f.events.push('done'))
    f.runFrame()
    expect(f.events.filter(e => e !== 'gpu')).toEqual(['a', 'b'])
    f.runFrame()
    expect(f.events.filter(e => e !== 'gpu')).toEqual(['a', 'b', 'full'])
    f.runFrame()
    expect(f.events.filter(e => e !== 'gpu')).toEqual(['a', 'b', 'full', 'c', 'done'])
  })
  it('bounds submitted work and waits for completed GPU time before continuing', () => {
    const f = fixture(); f.queue.idleBatch = true
    f.sync.mockImplementation(() => { f.events.push('gpu'); vi.mocked(performance.now).mockReturnValue(130) })
    f.queue.start(f.scratch, [() => {}, f.small('a'), f.small('b')], () => {})
    f.runFrame()
    expect(f.events).toEqual(['a', 'gpu'])
    expect(f.queue.current?.next).toBe(2)
  })
  it('keeps final rendering and chained job completion outside a small group', () => {
    const f = fixture(); f.queue.idleBatch = true
    f.queue.start(f.scratch, [() => {}, f.small('a'), f.small('last')], () => f.events.push('full-finish'))
    f.runFrame()
    expect(f.events).toEqual(['a', 'gpu'])
    f.runFrame()
    expect(f.events).toEqual(['a', 'gpu', 'last', 'full-finish', 'gpu'])
  })
  it('caps the total draw and pixel work before the next operation', () => {
    const f = fixture(); f.queue.idleBatch = true
    f.queue.start(f.scratch, [() => {}, f.small('a'), f.small('b'), f.small('c'), f.small('d')], () => {})
    f.runFrame()
    expect(f.events.filter(e => e !== 'gpu')).toEqual(['a', 'b', 'c'])
    const p = fixture(); p.queue.idleBatch = true
    p.queue.start(p.scratch, [() => {}, p.small('a', 1 << 20), p.small('b', 1 << 20), p.small('c')], () => {})
    p.runFrame()
    expect(p.events.filter(e => e !== 'gpu')).toEqual(['a', 'b'])
  })
  it('never continues a canceled job or consumes its replacement', () => {
    const f = fixture(); f.queue.idleBatch = true
    const replace = smallSettleOperation(() => {
      f.queue.cancel()
      f.queue.start(f.scratch, [() => f.events.push('new-capture'), f.small('new')], () => f.events.push('new-done'))
    }, () => ({ draws: 1, pixels: 0 }))
    f.queue.start(f.scratch, [() => {}, replace, f.small('old')], () => f.events.push('old-done'))
    f.runFrame()
    expect(f.events).toEqual(['new-capture', 'gpu'])
    expect(f.queue.current?.next).toBe(1)
    f.runFrame()
    expect(f.events.filter(e => e !== 'gpu')).toEqual(['new-capture', 'new', 'new-done'])
  })
  it('does not read later metadata after the scratch is destroyed', () => {
    const f = fixture(); f.queue.idleBatch = true
    const laterCost = vi.fn(() => ({ draws: 1, pixels: 1 }))
    const destroy = smallSettleOperation(() => { Object.assign(f.scratch, { live: false }) }, () => ({ draws: 1, pixels: 1 }))
    f.queue.start(f.scratch, [() => {}, destroy, smallSettleOperation(() => f.events.push('old'), laterCost), () => {}], () => {})
    f.runFrame()
    expect(laterCost).not.toHaveBeenCalled()
    expect(f.events).toEqual(['gpu'])
    f.runFrame()
    expect(f.queue.current).toBeNull()
  })
  it('keeps one-operation scheduling while the pen is down', () => {
    const f = fixture(); f.queue.idleBatch = true; f.drawing()
    f.queue.start(f.scratch, [() => {}, f.small('a'), f.small('b')], () => {})
    f.runFrame()
    expect(f.events).toEqual(['a'])
    expect(f.sync).not.toHaveBeenCalled()
  })
  it('stops before later cost reads if an owned empty drawing job loses its cache identity', () => {
    const f = fixture(); f.queue.idleBatch = true
    Object.assign(f.scratch, { live: false })
    let owned = true
    const abort = vi.fn(), laterCost = vi.fn(() => ({ draws: 1, pixels: 1 }))
    f.queue.start(f.scratch, [() => {}, smallSettleOperation(() => { owned = false }, () => ({ draws: 1, pixels: 1 })), smallSettleOperation(() => f.events.push('old'), laterCost)], () => f.events.push('finish'), { isAlive: () => owned, abort })
    f.runFrame()
    expect(laterCost).not.toHaveBeenCalled(); expect(f.events).toEqual(['gpu'])
    f.runFrame()
    expect(abort).toHaveBeenCalledTimes(1); expect(f.queue.current).toBeNull()
  })

})
