import { afterEach, expect, it, vi } from 'vitest'
import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { contactPulseOp, frontStepOp, WatercolorSettleQueue } from './WatercolorSettleQueue'
function fixture(cost = 0) {
  let now = 0, drawing = false, serial = 0
  const frames = new Map<number, FrameRequestCallback>(), events: number[] = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const sync = vi.fn(() => { now += cost })
  const q = new WatercolorSettleQueue({ beforeStart() {}, perf: () => ({ settleStart: 0, settleOps: 0, settleMs: 0 }),
    isDrawing: () => drawing, backlogSize: () => 100, backlogMax: () => 4, syncGpu: sync, noteActivity() {}, scheduleFieldRelease() {} })
  const step = (id: number) => contactPulseOp(() => events.push(id))
  const front = (id: number) => frontStepOp(() => events.push(id))
  const frame = (gap = 16) => { now += gap; const [id, fn] = [...frames][0]; frames.delete(id); fn(now) }
  const start = (ops: Array<() => void>) => q.start({ live: true } as RibbonStrokeScratch, [() => events.push(0), ...ops], () => events.push(99))
  return { q, sync, events, step, front, frame, start, setDrawing: (v: boolean) => { drawing = v } }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('keeps front batches separate from contact pulses and uploads', () => {
  const f = fixture(); f.q.frontBatchEnabled = true; f.q.contactBatchEnabled = true
  f.start([f.front(1), f.front(2), f.step(3), () => f.events.push(7)]); f.frame()
  expect(f.events).toEqual([0, 1, 2]); expect(f.sync).toHaveBeenCalledTimes(2)
})
it('limits one front chunk over budget to its existing work', () => {
  const f = fixture(12); f.q.frontBatchEnabled = true
  f.start([f.front(1), f.front(2)]); f.frame()
  expect(f.events).toEqual([0, 1]); expect(f.sync).toHaveBeenCalledTimes(1)
})
it('bounds one post-lift batch to four pulses even with a peer backlog', () => {
  const f = fixture(); f.q.contactBatchEnabled = true; f.start(Array.from({ length: 8 }, (_, i) => f.step(i + 1))); f.frame()
  expect(f.events).toEqual([0, 1, 2, 3, 4]); expect(f.sync).toHaveBeenCalledTimes(4)
})
it('stops after GPU elapsed budget, including a slow first heavy step', () => {
  const f = fixture(12); f.q.contactBatchEnabled = true; f.start([f.step(1), f.step(2)]); f.frame()
  expect(f.events).toEqual([0, 1]); expect(f.sync).toHaveBeenCalledTimes(1)
})
it.each([8, 16] as const)('permits cap %i only within the same four millisecond wall budget', cap => {
  const f = fixture(0.5); f.q.contactBatchEnabled = true; f.q.contactBatchMax = cap
  f.start(Array.from({ length: 32 }, (_, i) => f.step(i + 1))); f.frame()
  expect(f.events).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]); expect(f.sync).toHaveBeenCalledTimes(8)
})
it('retains the upload barrier with the larger diagnostic cap', () => {
  const f = fixture(); f.q.contactBatchEnabled = true; f.q.contactBatchMax = 16
  f.start([f.step(1), f.step(2), () => f.events.push(7), f.step(3)]); f.frame()
  expect(f.events).toEqual([0, 1, 2]); expect(f.sync).toHaveBeenCalledTimes(2)
})
it('keeps the hard cap bounded if a runtime diagnostic passes an unsupported value', () => {
  const f = fixture(); f.q.contactBatchEnabled = true; f.q.contactBatchMax = 400 as 4
  f.start(Array.from({ length: 32 }, (_, i) => f.step(i + 1))); f.frame()
  expect(f.events).toEqual([0, 1, 2, 3, 4]); expect(f.sync).toHaveBeenCalledTimes(4)
})
it('does not cross an upload/capture barrier', () => {
  const f = fixture(); f.q.contactBatchEnabled = true; f.start([f.step(1), () => f.events.push(7), f.step(2)]); f.frame()
  expect(f.events).toEqual([0, 1]); f.frame(); expect(f.events).toEqual([0, 1, 7, 2, 99])
})
it('keeps active pen and late-frame work at the existing limit', () => {
  const f = fixture(); f.q.contactBatchEnabled = true; f.setDrawing(true); f.start([f.step(1), f.step(2)]); f.frame()
  expect(f.events).toEqual([0, 1]); expect(f.sync).not.toHaveBeenCalled(); f.setDrawing(false); f.frame(25)
  expect(f.events).toEqual([0, 1, 2, 99]); expect(f.sync).not.toHaveBeenCalled()
})
it('retains abort ownership if a pulse cancels its job', () => {
  const f = fixture(), abort = vi.fn(), finish = vi.fn(); f.q.contactBatchEnabled = true
  f.q.start({ live: true } as RibbonStrokeScratch, [() => {}, contactPulseOp(() => f.q.cancel()), f.step(2)], finish, { isAlive: () => true, abort }); f.frame()
  expect(abort).toHaveBeenCalledTimes(1); expect(finish).not.toHaveBeenCalled(); expect(f.events).toEqual([])
})
