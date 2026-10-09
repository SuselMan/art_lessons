import { expect, it, vi } from 'vitest'
import { WatercolorCanonicalFIFO } from './WatercolorCanonicalFIFO'

function fixture(observe: (cap: object, queue: WatercolorCanonicalFIFO) => void, enabled = true) {
  const frames: Array<() => void> = []
  let blocked = false
  const changed = vi.fn(), failed = vi.fn()
  const queue = new WatercolorCanonicalFIFO({ blocked: () => blocked,
    schedule: cb => { frames.push(cb); return frames.length }, unschedule: () => {}, changed, failed,
    advance: (work, _current, _request, cap) => { observe(cap!, queue); return work.next() } }, enabled)
  return { queue, changed, failed, tick: () => frames.shift()!(), block: () => { blocked = true } }
}
const request = () => ({ execute: function* () { yield 1 }, cancel: vi.fn() })

it('attests only its exact synchronous sole head and retires before changed/next continuation', () => {
  let previous: object | undefined
  const foreign = fixture(() => {})
  const f = fixture((cap, queue) => {
    expect(queue.pending).toBe(true)
    expect(queue.isSoleExecutingOwner({})).toBe(false)
    expect(foreign.queue.isSoleExecutingOwner(cap)).toBe(false)
    if (previous) expect(queue.isSoleExecutingOwner(previous)).toBe(false)
    expect(queue.isSoleExecutingOwner(cap)).toBe(true)
    previous = cap
  })
  f.changed.mockImplementation(() => expect(f.queue.isSoleExecutingOwner(previous!)).toBe(false))
  f.queue.enqueue(request()); f.tick(); f.tick()
  expect(f.queue.pending).toBe(false)
  expect(f.queue.isSoleExecutingOwner(previous!)).toBe(false)
})
it('rejects second queued owner, blocked state and cancelled epoch inside the window', () => {
  const f = fixture((cap, queue) => {
    expect(queue.isSoleExecutingOwner(cap)).toBe(true)
    const other = request(); queue.enqueue(other)
    expect(queue.isSoleExecutingOwner(cap)).toBe(false)
    expect(queue.cancelUnstarted(other)).toBe(true)
    f.block(); expect(queue.isSoleExecutingOwner(cap)).toBe(false)
    queue.cancel(true); expect(queue.isSoleExecutingOwner(cap)).toBe(false)
  })
  f.queue.enqueue(request()); f.tick()
  expect(f.queue.pending).toBe(true) // blocked is still part of ordinary pending
})
it('revokes on throw and refuses nested execution without replacing the active witness', () => {
  let held: object
  const f = fixture((cap, queue) => {
    held = cap
    expect(() => (queue as any).advance()).toThrow('Reentrant canonical execution')
    expect(queue.isSoleExecutingOwner(cap)).toBe(true)
    throw Error('sentinel')
  })
  f.queue.enqueue(request()); f.tick()
  expect(f.failed).toHaveBeenCalledOnce()
  expect(f.queue.isSoleExecutingOwner(held!)).toBe(false)
})
it('does not emit a capability on the ordinary constructor path', () => {
  const f = fixture(cap => expect(cap).toBeUndefined(), false)
  f.queue.enqueue(request()); f.tick()
})

it('ignores requested capability in production without allocating diagnostic state', () => {
  vi.stubEnv('DEV', false)
  try {
    const f = fixture(cap => expect(cap).toBeUndefined(), true)
    f.queue.enqueue(request()); f.tick()
    expect(f.queue.isSoleExecutingOwner({})).toBe(false)
    expect((f.queue as any).capabilities).toBeNull()
    expect((f.queue as any).activeCapability).toBeNull()
  } finally { vi.unstubAllEnvs() }
})
