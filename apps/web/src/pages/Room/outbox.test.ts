import { describe, expect, it, vi } from 'vitest'
import type { SendResult, StrokeOperation } from '@art-lessons/shared'

import { Outbox } from './outbox'
import { createInMemoryOutboxStorage } from './outboxStorage'

function op(id: string): StrokeOperation {
  return {
    id, type: 'stroke', userId: 'user-a', timestamp: 0,
    layerId: 'layer-1', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs: [],
  }
}

/** Captures every scheduled retry instead of using a real (or fake) timer —
 *  the test drives them by calling `fire(index)` itself, so retry timing
 *  assertions never depend on real wall-clock delay. */
function captureSchedule() {
  const scheduled: Array<{ fn: () => void; delayMs: number }> = []
  const schedule = (fn: () => void, delayMs: number) => { scheduled.push({ fn, delayMs }) }
  return { scheduled, schedule }
}

/** Outbox.attempt is deliberately fire-and-forget (see its own doc comment
 *  on why enqueue/resendAll don't await it) — its internal chain
 *  (getAll → send → delete/put) is several microtask hops deep, so tests
 *  need to yield the microtask queue a few times before asserting on its
 *  outcome, not just once. */
async function flushMicrotasks(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('Outbox', () => {
  it('removes the entry and reports ok once send resolves', async () => {
    const storage = createInMemoryOutboxStorage()
    const onSettled = vi.fn()
    const outbox = new Outbox({
      storage, onSettled,
      send: async () => ({ ok: true, seq: 42 }) satisfies SendResult,
    })

    await outbox.enqueue(op('a'))
    await flushMicrotasks() // let runAttempt's internal awaits settle

    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { ok: true, seq: 42 })
    expect(await storage.getAll()).toEqual([])
  })

  it('treats a rejected SendResult as terminal — no retry, entry removed', async () => {
    const storage = createInMemoryOutboxStorage()
    const onSettled = vi.fn()
    const { scheduled, schedule } = captureSchedule()
    const outbox = new Outbox({
      storage, onSettled, schedule,
      send: async () => ({ ok: false, reason: 'target_gone' }) satisfies SendResult,
    })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()

    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { ok: false, reason: 'target_gone' })
    expect(await storage.getAll()).toEqual([])
    expect(scheduled).toHaveLength(0) // a definitive rejection must never be retried
  })

  it('keeps the entry and schedules a retry when send throws (network failure/timeout)', async () => {
    const storage = createInMemoryOutboxStorage()
    const onSettled = vi.fn()
    const { scheduled, schedule } = captureSchedule()
    const outbox = new Outbox({ storage, onSettled, schedule, send: async () => { throw new Error('timed out') } })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()

    expect(onSettled).not.toHaveBeenCalled()
    const stored = await storage.getAll()
    expect(stored).toHaveLength(1)
    expect(stored[0].attempts).toBe(1)
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].delayMs).toBe(1000)
  })

  it('doubles the backoff delay on each consecutive failure, up to the cap', async () => {
    const storage = createInMemoryOutboxStorage()
    const { scheduled, schedule } = captureSchedule()
    const outbox = new Outbox({ storage, schedule, send: async () => { throw new Error('down') } })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()
    expect(scheduled[0].delayMs).toBe(1000)

    // Drive four more retries by firing the captured callback directly.
    for (let i = 0; i < 4; i++) {
      scheduled[scheduled.length - 1].fn()
      await flushMicrotasks()
    }

    expect(scheduled.map(s => s.delayMs)).toEqual([1000, 2000, 4000, 8000, 16000])
  })

  it('caps backoff at 30s and never exceeds it on further failures', async () => {
    const storage = createInMemoryOutboxStorage()
    const { scheduled, schedule } = captureSchedule()
    const outbox = new Outbox({ storage, schedule, send: async () => { throw new Error('down') } })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()
    for (let i = 0; i < 7; i++) {
      scheduled[scheduled.length - 1].fn()
      await flushMicrotasks()
    }

    expect(scheduled[scheduled.length - 1].delayMs).toBe(30000)
  })

  it('a retry that finally succeeds removes the entry and reports it', async () => {
    const storage = createInMemoryOutboxStorage()
    const onSettled = vi.fn()
    const { scheduled, schedule } = captureSchedule()
    let shouldFail = true
    const outbox = new Outbox({
      storage, onSettled, schedule,
      send: async () => {
        if (shouldFail) throw new Error('down')
        return { ok: true, seq: 7 } satisfies SendResult
      },
    })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()
    expect(await storage.getAll()).toHaveLength(1)

    shouldFail = false
    scheduled[0].fn()
    await flushMicrotasks()

    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { ok: true, seq: 7 })
    expect(await storage.getAll()).toEqual([])
  })

  it('resendAll re-attempts every entry already in storage (e.g. restored after reload)', async () => {
    const storage = createInMemoryOutboxStorage()
    await storage.put({ op: op('a'), attempts: 2, nextRetryAt: 0 })
    await storage.put({ op: op('b'), attempts: 0, nextRetryAt: 0 })
    const sent: string[] = []
    const outbox = new Outbox({
      storage,
      send: async o => { sent.push(o.id); return { ok: true, seq: 1 } satisfies SendResult },
    })

    await outbox.resendAll()
    await flushMicrotasks()

    expect(sent.sort()).toEqual(['a', 'b'])
    expect(await storage.getAll()).toEqual([])
  })

  it('does not pile up a second concurrent attempt for the same still-in-flight entry', async () => {
    const storage = createInMemoryOutboxStorage()
    let calls = 0
    let resolveSend: (r: SendResult) => void = () => {}
    const outbox = new Outbox({
      storage,
      send: async () => { calls++; return new Promise<SendResult>(resolve => { resolveSend = resolve }) },
    })

    await outbox.enqueue(op('a'))
    await outbox.resendAll() // races the still-in-flight first attempt
    await Promise.resolve()

    expect(calls).toBe(1)
    resolveSend({ ok: true, seq: 1 })
    await flushMicrotasks()
    expect(await storage.getAll()).toEqual([])
  })
})
