import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { WatercolorSettleQueue } from '../../apps/web/src/engine/src/watercolor/WatercolorSettleQueue'
it('installs, reads and restores the actual Queue observer before its caller consumes stats', () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.push(fn); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockReturnValue(1)
  const sync = vi.fn(), perf = {settleStart:0,settleOps:0,settleMs:0}
  const queue = new WatercolorSettleQueue({beforeStart(){},perf:()=>perf,isDrawing:()=>false,backlogSize:()=>0,canonicalBacklogSize:()=>183,backlogMax:()=>4,syncGpu:sync,noteActivity(){},scheduleFieldRelease(){}})
  const original = {start:queue.start,advance:queue.advance,tick:(queue as any).tick}
  const install = new Function('return '+readFileSync('temp/canonical-budget/queue-observer.js','utf8'))()
  const observer = install({_settleQueue:queue})
  expect(typeof observer.restore).toBe('function')
  queue.canonicalBacklogBatchEnabled = true
  const scratch = {live:true} as any
  const writes: number[] = []
  queue.start(scratch,[()=>writes.push(0),...Array.from({length:4},(_,i)=>()=>writes.push(i+1))],()=>writes.push(5))
  frames.shift()!(1)
  expect(writes).toEqual([0,1,2,3,4,5])
  expect(observer.stats.units).toBe(4);expect(observer.stats.syncCalls).toBe(4)
  expect(observer.stats.jobs[0].finished).toBe(1)
  observer.restore()
  expect(queue.start).toBe(original.start);expect(queue.advance).toBe(original.advance);expect((queue as any).tick).toBe(original.tick)
  expect((queue as any).ctx.syncGpu).toBe(sync)
  vi.restoreAllMocks();vi.unstubAllGlobals()
})
