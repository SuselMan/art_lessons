import { afterEach, expect, it, vi } from 'vitest'
import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { frontStepOp, presentationStepOp, WatercolorSettleQueue } from './WatercolorSettleQueue'
import { captureQueue, type BatchSchedule } from '../../../../../../docs/qa/harness/728-engine-webgl2/queueCapture'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function run(schedule: BatchSchedule, syncCost = 0) {
  let now = 0, serial = 0
  const frames = new Map<number, FrameRequestCallback>(), events: string[] = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const queue = new WatercolorSettleQueue({ beforeStart() {}, perf: () => ({ settleStart: 0, settleOps: 0, settleMs: 0 }), isDrawing: () => false, backlogSize: () => 0, backlogMax: () => 4, syncGpu: () => { now += syncCost }, noteActivity() {}, scheduleFieldRelease() {} })
  const capture = captureQueue(queue, schedule), token = {}
  queue.start({ live: true } as RibbonStrokeScratch, [() => events.push('capture'), frontStepOp(() => events.push('f1')), frontStepOp(() => events.push('f2')), () => events.push('upload'), presentationStepOp(() => events.push('p1'), token), presentationStepOp(() => events.push('p2'), token)], () => events.push('finish'))
  while (frames.size) { now += 16; const [id, fn] = [...frames][0]; frames.delete(id); fn(now) }
  const report = capture.snapshot(); capture.detach()
  return { events, report }
}
it('records grouping without changing order or crossing upload boundaries', () => {
  const baseline = run('baseline'), candidate = run('front-presentation')
  expect(candidate.events).toEqual(baseline.events)
  expect(baseline.report.tickCount).toBe(5); expect(candidate.report.tickCount).toBe(3)
  expect(candidate.report.ticks.map(t => t.ops)).toEqual([
    { contact: 0, front: 2, presentation: 0, barrier: 0 },
    { contact: 0, front: 0, presentation: 0, barrier: 1 },
    { contact: 0, front: 0, presentation: 2, barrier: 0 },
  ])
  expect(candidate.report.ticks.map(t => t.syncCount)).toEqual([2, 0, 2])
  expect(candidate.report.flags).toEqual({ front: true, presentation: true, contact: false, continuation: false })
})
it('records actual synchronization budget; heavy steps remain one per tick', () => {
  const { report } = run('front-presentation', 5)
  expect(report.tickCount).toBe(5)
  expect(report.ticks.filter(t => t.syncCount).every(t => t.syncCount === 1 && t.syncMs === 5 && t.elapsedMs === 5)).toBe(true)
})
