import { describe, expect, it, vi } from 'vitest'
import type { SendResult, StrokeOperation } from '@grafetto/shared'

import { Outbox } from './outbox'
import { createInMemoryOutboxStorage } from './outboxStorage'

// (#358) The room every Outbox in this file belongs to. Named rather than
// inlined so the cross-room test below reads as a contrast, not a typo.
const ROOM = 'room-a'

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
      roomId: ROOM,
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
      roomId: ROOM,
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
    const outbox = new Outbox({ roomId: ROOM, storage, onSettled, schedule, send: async () => { throw new Error('timed out') } })

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
    const outbox = new Outbox({ roomId: ROOM, storage, schedule, send: async () => { throw new Error('down') } })

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
    const outbox = new Outbox({ roomId: ROOM, storage, schedule, send: async () => { throw new Error('down') } })

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
      roomId: ROOM,
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
    await storage.put({ op: op('a'), roomId: ROOM, attempts: 2, nextRetryAt: 0 })
    await storage.put({ op: op('b'), roomId: ROOM, attempts: 0, nextRetryAt: 0 })
    const sent: string[] = []
    const outbox = new Outbox({
      roomId: ROOM,
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
      roomId: ROOM,
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

// (#358) The queue is durable and shared by every room in one browser profile,
// so "whose work is this" has to be part of the record. It wasn't: opening any
// next room drained the previous room's unconfirmed strokes into it, and the
// server recorded them there — it stamps an operation with whatever room the
// sending socket has joined, and the payload carries no room of its own.
// Reported from a tablet on 2026-07-30: strokes drawn in an infinite room
// started appearing in a different, ordinary room after switching to it.
describe('Outbox room scoping', () => {
  it('never sends another room\'s persisted work, and leaves it queued', async () => {
    const storage = createInMemoryOutboxStorage()
    await storage.put({ op: op('mine'),      roomId: ROOM,     attempts: 0, nextRetryAt: 0 })
    await storage.put({ op: op('elsewhere'), roomId: 'room-b', attempts: 0, nextRetryAt: 0 })
    const sent: string[] = []
    const outbox = new Outbox({
      roomId: ROOM, storage,
      send: async o => { sent.push(o.id); return { ok: true, seq: 1 } satisfies SendResult },
    })

    await outbox.hydrate()
    await outbox.resendAll()
    await flushMicrotasks()

    expect(sent).toEqual(['mine'])
    // Not merely unsent — still there, waiting for its own room to be opened
    // again. Discarding it would trade one silent loss for another.
    expect(await storage.getAll()).toEqual([
      expect.objectContaining({ roomId: 'room-b', op: expect.objectContaining({ id: 'elsewhere' }) }),
    ])
  })

  it('counts only this room\'s work as pending', async () => {
    const storage = createInMemoryOutboxStorage()
    await storage.put({ op: op('elsewhere'), roomId: 'room-b', attempts: 0, nextRetryAt: 0 })
    const outbox = new Outbox({
      roomId: ROOM, storage, canSend: () => false,
      send: async () => ({ ok: true, seq: 1 }) satisfies SendResult,
    })

    await outbox.hydrate()

    // The offline screen and ConnectionBanner report this number as "your
    // unsaved work" (#201/#313) — another room's backlog inflating it would be
    // a lie in the one place the app is trusted to be exact.
    expect(outbox.pendingCount).toBe(0)
  })

  it('stamps its own room on everything it enqueues', async () => {
    const storage = createInMemoryOutboxStorage()
    const outbox = new Outbox({
      roomId: ROOM, storage, canSend: () => false, // parked, so the entry stays put
      send: async () => ({ ok: true, seq: 1 }) satisfies SendResult,
    })

    await outbox.enqueue(op('a'))

    expect(await storage.getAll()).toEqual([expect.objectContaining({ roomId: ROOM })])
  })
})

// (#296) The send path must not depend on storage at all. It used to:
// enqueue awaited storage.put before attempting a send, and runAttempt
// looked the operation up through storage.getAll(). One IndexedDB failure
// therefore meant the operation was never sent — it painted locally and
// silently never left the device. Observed on a real Android tablet where
// strokes reached neither the server nor any peer while the same room worked
// from desktop; a crashed tab is an ordinary way to leave IndexedDB
// unopenable, so this failed exactly when it mattered most.
describe('Outbox with broken storage', () => {
  function brokenStorage(broken: Partial<Record<'getAll' | 'put' | 'delete', boolean>>) {
    const inner = createInMemoryOutboxStorage()
    return {
      getAll: async () => {
        if (broken.getAll) throw new Error('IndexedDB unavailable')
        return inner.getAll()
      },
      put: async (entry: Parameters<typeof inner.put>[0]) => {
        if (broken.put) throw new Error('IndexedDB unavailable')
        return inner.put(entry)
      },
      delete: async (id: string) => {
        if (broken.delete) throw new Error('IndexedDB unavailable')
        return inner.delete(id)
      },
    }
  }

  it('still sends when the operation cannot be persisted', async () => {
    const send = vi.fn(async () => ({ ok: true, seq: 1 }) satisfies SendResult)
    const onSettled = vi.fn()
    const outbox = new Outbox({ roomId: ROOM, storage: brokenStorage({ put: true }), send, onSettled })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()

    expect(send).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { ok: true, seq: 1 })
  })

  it('still reports the result when the settled entry cannot be cleared', async () => {
    const onSettled = vi.fn()
    const outbox = new Outbox({
      roomId: ROOM,
      storage: brokenStorage({ delete: true }),
      send: async () => ({ ok: true, seq: 7 }) satisfies SendResult,
      onSettled,
    })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()

    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { ok: true, seq: 7 })
  })

  it('resendAll still retries this session\'s queue when the store cannot be read', async () => {
    const { scheduled, schedule } = captureSchedule()
    let failSend = true
    const send = vi.fn(async () => {
      if (failSend) throw new Error('offline')
      return { ok: true, seq: 3 } satisfies SendResult
    })
    const onSettled = vi.fn()
    const outbox = new Outbox({ roomId: ROOM, storage: brokenStorage({ getAll: true, put: true }), send, onSettled, schedule })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(1) // first attempt happened despite put failing
    expect(scheduled).toHaveLength(1)     // and it queued a retry after failing

    failSend = false
    await outbox.resendAll()
    await flushMicrotasks()

    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { ok: true, seq: 3 })
  })

  it('delivers every operation with storage completely unavailable', async () => {
    const sent: string[] = []
    const outbox = new Outbox({
      roomId: ROOM,
      storage: brokenStorage({ getAll: true, put: true, delete: true }),
      send: async o => { sent.push(o.id); return { ok: true, seq: sent.length } satisfies SendResult },
    })

    await outbox.enqueue(op('a'))
    await outbox.enqueue(op('b'))
    await outbox.enqueue(op('c'))
    await flushMicrotasks()

    expect(sent).toEqual(['a', 'b', 'c'])
  })

  it('recovers a previous page load\'s operations from storage on resendAll', async () => {
    const storage = createInMemoryOutboxStorage()
    await storage.put({ op: op('from-last-session'), roomId: ROOM, attempts: 2, nextRetryAt: 0 })
    const sent: string[] = []
    const outbox = new Outbox({
      roomId: ROOM,
      storage,
      send: async o => { sent.push(o.id); return { ok: true, seq: 1 } satisfies SendResult },
    })

    await outbox.resendAll()
    await flushMicrotasks()

    expect(sent).toEqual(['from-last-session'])
  })
})

// (#298) The failure that bricked a tablet: the server answered nothing at
// all for an operation sent before join_room, so every send timed out and
// retried forever, and resendAll fired every queued entry at once. Measured
// on the device: 384 strokes at 42-49 attempts each, ~55 MB of JSON
// serialized per round, renderer RSS sawtoothing 275 -> 512 MB until the
// low-memory killer took it out — which reloaded the tab, back to the gate,
// and started the whole cycle again.
describe('Outbox send gating and concurrency', () => {
  it('sends nothing at all while canSend is false', async () => {
    const send = vi.fn(async () => ({ ok: true, seq: 1 }) satisfies SendResult)
    const outbox = new Outbox({
      roomId: ROOM,
      storage: createInMemoryOutboxStorage(), send, canSend: () => false,
    })

    await outbox.enqueue(op('a'))
    await outbox.enqueue(op('b'))
    await flushMicrotasks()

    expect(send).not.toHaveBeenCalled()
  })

  it('releases the parked queue once canSend turns true', async () => {
    let joined = false
    const sent: string[] = []
    const outbox = new Outbox({
      roomId: ROOM,
      storage: createInMemoryOutboxStorage(),
      send: async o => { sent.push(o.id); return { ok: true, seq: 1 } satisfies SendResult },
      canSend: () => joined,
    })

    await outbox.enqueue(op('a'))
    await outbox.enqueue(op('b'))
    await flushMicrotasks()
    expect(sent).toEqual([])

    joined = true
    await outbox.resendAll()
    await flushMicrotasks(12)

    expect(sent.sort()).toEqual(['a', 'b'])
  })

  it('never has more than MAX_CONCURRENT_SENDS operations in flight', async () => {
    let inFlight = 0
    let peak = 0
    const release: Array<() => void> = []
    const outbox = new Outbox({
      roomId: ROOM,
      storage: createInMemoryOutboxStorage(),
      send: async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise<void>(res => release.push(res))
        inFlight--
        return { ok: true, seq: 1 } satisfies SendResult
      },
    })

    for (let i = 0; i < 10; i++) await outbox.enqueue(op(`op-${i}`))
    await flushMicrotasks(12)

    expect(peak).toBeLessThanOrEqual(2)
    // Drain so the test doesn't leave promises hanging.
    while (release.length) release.shift()!()
    await flushMicrotasks(40)
  })

  it('retries `not_joined` instead of discarding the operation', async () => {
    const { scheduled, schedule } = captureSchedule()
    const onSettled = vi.fn()
    let joined = false
    const outbox = new Outbox({
      roomId: ROOM,
      storage: createInMemoryOutboxStorage(),
      send: async () => (joined
        ? { ok: true, seq: 5 } satisfies SendResult
        : { ok: false, reason: 'not_joined' } satisfies SendResult),
      onSettled, schedule,
    })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()
    // Not settled — a transient rejection must not count as a verdict.
    expect(onSettled).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(1)

    joined = true
    scheduled[0].fn()
    await flushMicrotasks(12)

    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { ok: true, seq: 5 })
  })

  it('stops retrying after MAX_ATTEMPTS but keeps the operation queued', async () => {
    const { scheduled, schedule } = captureSchedule()
    const storage = createInMemoryOutboxStorage()
    const onStalled = vi.fn()
    const outbox = new Outbox({
      roomId: ROOM,
      storage, schedule, onStalled,
      send: async () => { throw new Error('timeout') },
    })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()
    // Drive every scheduled retry until the outbox gives up on its own.
    for (let i = 0; i < 30 && scheduled.length > 0; i++) {
      const next = scheduled.shift()!
      next.fn()
      await flushMicrotasks(12)
    }

    expect(onStalled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    expect(scheduled).toHaveLength(0)            // nothing left retrying in the background
    expect(await storage.getAll()).toHaveLength(1) // but the work is NOT thrown away
  })

  it('re-arms stalled operations on the next resendAll', async () => {
    const { scheduled, schedule } = captureSchedule()
    let failing = true
    const sent: string[] = []
    const outbox = new Outbox({
      roomId: ROOM,
      storage: createInMemoryOutboxStorage(), schedule,
      send: async o => {
        if (failing) throw new Error('timeout')
        sent.push(o.id)
        return { ok: true, seq: 1 } satisfies SendResult
      },
    })

    await outbox.enqueue(op('a'))
    await flushMicrotasks()
    for (let i = 0; i < 30 && scheduled.length > 0; i++) {
      scheduled.shift()!.fn()
      await flushMicrotasks(12)
    }
    expect(sent).toEqual([])

    failing = false
    await outbox.resendAll()
    await flushMicrotasks(12)

    expect(sent).toEqual(['a'])
  })

  // (#201) The queue used to be entirely invisible to the UI, so a user who
  // drew through a long drop had no way to tell whether any of it survived.
  describe('pending count reporting', () => {
    it('reports the queue growing and shrinking', async () => {
      const changes: Array<[number, number]> = []
      const outbox = new Outbox({
        roomId: ROOM,
        storage: createInMemoryOutboxStorage(),
        onPendingChange: (pending, stalled) => changes.push([pending, stalled]),
        send: async () => ({ ok: true, seq: 1 }) satisfies SendResult,
      })

      await outbox.enqueue(op('a'))
      await flushMicrotasks()

      expect(changes[0]).toEqual([1, 0])
      expect(changes.at(-1)).toEqual([0, 0])
      expect(outbox.pendingCount).toBe(0)
    })

    it('keeps counting an operation that could not be sent', async () => {
      const { schedule } = captureSchedule()
      const outbox = new Outbox({
        roomId: ROOM,
        storage: createInMemoryOutboxStorage(),
        schedule,
        send: async () => { throw new Error('offline') },
      })

      await outbox.enqueue(op('a'))
      await flushMicrotasks()

      expect(outbox.pendingCount).toBe(1)
    })

    it('counts stalled entries separately once they stop retrying', async () => {
      const { scheduled, schedule } = captureSchedule()
      const changes: Array<[number, number]> = []
      const outbox = new Outbox({
        roomId: ROOM,
        storage: createInMemoryOutboxStorage(),
        schedule,
        onPendingChange: (pending, stalled) => changes.push([pending, stalled]),
        send: async () => { throw new Error('offline') },
      })

      await outbox.enqueue(op('a'))
      await flushMicrotasks()
      for (let i = 0; i < 30 && scheduled.length > 0; i++) {
        scheduled.shift()!.fn()
        await flushMicrotasks(12)
      }

      // Still queued and persisted — stalled is "given up for now", never a
      // discard (see MAX_ATTEMPTS).
      expect(outbox.pendingCount).toBe(1)
      expect(outbox.stalledCount).toBe(1)
      expect(changes.at(-1)).toEqual([1, 1])
    })
  })

  // (#313) The offline screen needs this number at exactly the moment a join
  // has not happened and cannot — resendAll would be gated by canSend.
  describe('hydrate', () => {
    it('surfaces a queue left by an earlier page load without sending anything', async () => {
      const storage = createInMemoryOutboxStorage()
      await storage.put({ op: op('from-last-session'), roomId: ROOM, attempts: 0, nextRetryAt: 0 })

      const send = vi.fn()
      const outbox = new Outbox({ roomId: ROOM, storage, send, canSend: () => false })
      await outbox.hydrate()

      expect(outbox.pendingCount).toBe(1)
      expect(send).not.toHaveBeenCalled()
    })

    it('reports the recovered count through onPendingChange', async () => {
      const storage = createInMemoryOutboxStorage()
      await storage.put({ op: op('a'), roomId: ROOM, attempts: 0, nextRetryAt: 0 })
      await storage.put({ op: op('b'), roomId: ROOM, attempts: 0, nextRetryAt: 0 })
      const onPendingChange = vi.fn()

      const outbox = new Outbox({
        roomId: ROOM,
        storage, onPendingChange, canSend: () => false,
        send: async () => ({ ok: true, seq: 1 }) satisfies SendResult,
      })
      await outbox.hydrate()

      expect(onPendingChange).toHaveBeenCalledWith(2, 0)
    })

    it('does not double-count an operation already queued in this session', async () => {
      const storage = createInMemoryOutboxStorage()
      const outbox = new Outbox({
        roomId: ROOM,
        storage, canSend: () => false,
        send: async () => ({ ok: true, seq: 1 }) satisfies SendResult,
      })

      await outbox.enqueue(op('a'))
      await outbox.hydrate()

      expect(outbox.pendingCount).toBe(1)
    })
  })

  // (#358) Retiring the queue of a room that has been left. Scoping storage by
  // room was only half the fix: Room keeps one component across every
  // `/room/:id`, so the previous room's Outbox stayed alive with its retry
  // timers and a `send` closing over a socket that had since joined the next
  // room — and that is where its work went. These assert on the queue that is
  // being left behind, not on the new one.
  describe('dispose', () => {
    it('sends nothing when a retry scheduled before dispose fires afterwards', async () => {
      const storage = createInMemoryOutboxStorage()
      const { scheduled, schedule } = captureSchedule()
      const send = vi.fn(async () => { throw new Error('offline') })
      const outbox = new Outbox({ roomId: ROOM, storage, send, schedule })

      await outbox.enqueue(op('a'))
      await flushMicrotasks()
      expect(send).toHaveBeenCalledTimes(1) // the first attempt, made while the room was still open

      outbox.dispose()
      scheduled[0].fn() // the timer cannot be cancelled — see dispose's own comment
      await flushMicrotasks()

      expect(send).toHaveBeenCalledTimes(1)
    })

    it('sends nothing enqueued after dispose', async () => {
      const storage = createInMemoryOutboxStorage()
      const send = vi.fn(async () => ({ ok: true, seq: 1 }) satisfies SendResult)
      const outbox = new Outbox({ roomId: ROOM, storage, send })

      outbox.dispose()
      await outbox.enqueue(op('a'))
      await flushMicrotasks()

      expect(send).not.toHaveBeenCalled()
    })

    it('stops reporting a count, so the room now on screen does not inherit one', async () => {
      const storage = createInMemoryOutboxStorage()
      const { scheduled, schedule } = captureSchedule()
      const onPendingChange = vi.fn()
      const outbox = new Outbox({
        roomId: ROOM,
        storage, schedule, onPendingChange,
        send: async () => { throw new Error('offline') },
      })

      await outbox.enqueue(op('a'))
      await flushMicrotasks()
      outbox.dispose()
      onPendingChange.mockClear()

      scheduled[0].fn()
      await flushMicrotasks()

      // The counter belongs to whichever room is mounted now; a retiring queue
      // reporting its own leftovers would make that room claim work it never
      // had (see ConnectionBanner's "N unsent").
      expect(onPendingChange).not.toHaveBeenCalled()
    })

    it('leaves its unsent work durable, so its own room still sends it later', async () => {
      const storage = createInMemoryOutboxStorage()
      const { schedule } = captureSchedule()
      const outbox = new Outbox({
        roomId: ROOM,
        storage, schedule,
        send: async () => { throw new Error('offline') },
      })

      await outbox.enqueue(op('a'))
      await flushMicrotasks()
      outbox.dispose()

      // Disposing is not discarding: the entry is still stored under its own
      // room, which is the only place it may legally go.
      expect(await storage.getAll(ROOM)).toHaveLength(1)

      const reopened = new Outbox({
        roomId: ROOM,
        storage,
        send: async () => ({ ok: true, seq: 7 }) satisfies SendResult,
      })
      await reopened.hydrate()

      expect(reopened.pendingCount).toBe(1)
    })

    it('neither settles nor clears an operation whose send resolves after dispose', async () => {
      const storage = createInMemoryOutboxStorage()
      const onSettled = vi.fn()
      let settleSend: ((result: SendResult) => void) | undefined
      const outbox = new Outbox({
        roomId: ROOM,
        storage, onSettled,
        send: () => new Promise<SendResult>(resolve => { settleSend = resolve }),
      })

      await outbox.enqueue(op('a'))
      await flushMicrotasks()
      outbox.dispose()
      settleSend?.({ ok: true, seq: 1 })
      await flushMicrotasks()

      // Whatever the server did with it, this queue no longer speaks for
      // anyone: the durable copy stays (the id dedup makes the re-send free)
      // and the UI that has moved on hears nothing.
      expect(onSettled).not.toHaveBeenCalled()
      expect(await storage.getAll(ROOM)).toHaveLength(1)
    })
  })
})
