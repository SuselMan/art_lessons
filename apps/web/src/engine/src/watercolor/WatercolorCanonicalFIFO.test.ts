import { expect, it, vi } from 'vitest'
import { WatercolorCanonicalFIFO } from './WatercolorCanonicalFIFO'

function fixture() {
  let blocked = false, handle = 0
  const frames = new Map<number, () => void>()
  const failed = vi.fn()
  const queue = new WatercolorCanonicalFIFO({ blocked: () => blocked,
    schedule: cb => { frames.set(++handle, cb); return handle },
    unschedule: h => { frames.delete(h) }, changed: vi.fn(), failed })
  const tick = () => { const [h, cb] = frames.entries().next().value!; frames.delete(h); cb() }
  return { queue, tick, frames, failed, block: (v: boolean) => { blocked = v } }
}
it('keeps input non-executing and holds subsequent material behind the active solver', async () => {
  const f = fixture(), events: string[] = []
  f.queue.enqueue({ execute: function* () { events.push('source'); yield 1; events.push('finish'); f.block(true) }, cancel: vi.fn() })
  f.queue.enqueue({ execute: function* () { events.push('next-source') }, cancel: vi.fn() })
  const ready = f.queue.ready()
  expect(events).toEqual([])
  f.tick(); f.tick()
  expect(events).toEqual(['source', 'finish'])
  f.tick()
  expect(events).toEqual(['source', 'finish'])
  f.block(false); f.tick()
  expect(events).toEqual(['source', 'finish', 'next-source'])
  expect(await ready).toBe(true)
})
it('cancels paused and waiting owners with loss semantics and invalidates old callbacks', async () => {
  const f = fixture(), cancelA = vi.fn(), cancelB = vi.fn(), events: string[] = []
  f.queue.enqueue({ execute: function* () { events.push('first'); yield 1; events.push('stale') }, cancel: cancelA })
  f.queue.enqueue({ execute: function* () { events.push('waiting') }, cancel: cancelB })
  const ready = f.queue.ready(); f.tick()
  const stale = [...f.frames.values()][0]
  f.queue.cancel(true); stale()
  expect(events).toEqual(['first'])
  expect(cancelA).toHaveBeenCalledWith(true); expect(cancelB).toHaveBeenCalledWith(true)
  expect(await ready).toBe(false)
})
it('does not corrupt the FIFO when an executing owner cancels it reentrantly', () => {
  const f = fixture(), next = vi.fn()
  f.queue.enqueue({ execute: function* () { f.queue.cancel(false) }, cancel: vi.fn() })
  f.queue.enqueue({ execute: function* () { next() }, cancel: vi.fn() })
  f.tick()
  expect(next).not.toHaveBeenCalled(); expect(f.queue.pending).toBe(false)
})
it('does not let a callback from a lost epoch erase the new scheduled frame', () => {
  const f = fixture(), old = vi.fn(), fresh = vi.fn()
  f.queue.enqueue({ execute: function* () { old(); yield 1 }, cancel: vi.fn() })
  const stale = [...f.frames.values()][0]
  f.queue.cancel(true)
  f.queue.enqueue({ execute: function* () { fresh(); yield 1 }, cancel: vi.fn() })
  const scheduled = [...f.frames.keys()]
  stale()
  expect([...f.frames.keys()]).toEqual(scheduled)
  f.tick()
  expect(old).not.toHaveBeenCalled(); expect(fresh).toHaveBeenCalledOnce()
})

it('reports queued canonical requests separately from a blocked solver', () => {
  const f = fixture()
  f.block(true)
  expect(f.queue.pending).toBe(true)
  expect(f.queue.backlogSize).toBe(0)
  f.queue.enqueue({ execute: function* () {}, cancel: vi.fn() })
  f.queue.enqueue({ execute: function* () {}, cancel: vi.fn() })
  expect(f.queue.backlogSize).toBe(2)
  f.tick(); expect(f.queue.backlogSize).toBe(2)
  f.block(false); f.tick(); expect(f.queue.backlogSize).toBe(1)
  f.tick(); expect(f.queue.backlogSize).toBe(0)
  f.queue.cancel(false)
})
