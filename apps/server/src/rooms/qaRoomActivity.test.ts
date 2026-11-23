import { describe, expect, it, vi } from 'vitest'
import { QaRoomActivity, type QaRoomActivityStore } from './qaRoomActivity.js'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function memoryStore() {
  let now = 1
  const rooms = new Map<string, { last: number; open: boolean }>()
  const store: QaRoomActivityStore = {
    async recoverInterrupted() { for (const state of rooms.values()) if (state.open) { state.last = now; state.open = false } },
    async opened(id) { rooms.set(id, { last: now, open: true }) },
    async closed(id) { rooms.set(id, { last: now, open: false }) },
    async touched(id) { const old = rooms.get(id); rooms.set(id, { last: now, open: old?.open ?? false }) },
  }
  return { store, rooms, time(n: number) { now = n } }
}

describe('QA room activity', () => {
  it('recovers only rooms open at a crash, preserving closed history across restarts', async () => {
    const db = memoryStore(); const first = new QaRoomActivity(db.store)
    await first.start(); await first.opened('closed'); await first.closed('closed'); await first.opened('crashed')
    db.time(30); const second = new QaRoomActivity(db.store); await second.start()
    expect(db.rooms.get('closed')).toEqual({ last: 1, open: false })
    expect(db.rooms.get('crashed')).toEqual({ last: 30, open: false })
    db.time(31); await new QaRoomActivity(db.store).start()
    expect(db.rooms.get('crashed')).toEqual({ last: 30, open: false })
  })

  it('does not let later joins overtake an outstanding last exit', async () => {
    const gate = deferred(), events: string[] = []
    const db = memoryStore()
    db.store.closed = async () => { events.push('exit start'); await gate.promise; events.push('exit end') }
    db.store.opened = async () => { events.push('join') }
    const tracker = new QaRoomActivity(db.store); await tracker.start()
    const leaving = tracker.closed('lesson'); const joining = tracker.opened('lesson')
    await Promise.resolve(); expect(events).toEqual(['exit start'])
    gate.resolve(); await Promise.all([leaving, joining])
    expect(events).toEqual(['exit start', 'exit end', 'join'])
  })

  it('fails closed permanently on a database error, including queued operations', async () => {
    const db = memoryStore(); db.store.opened = vi.fn(async () => { throw Error('offline') })
    db.store.closed = vi.fn(async () => {})
    const tracker = new QaRoomActivity(db.store); await tracker.start()
    const first = tracker.opened('lesson'); const second = tracker.closed('lesson')
    await expect(first).rejects.toThrow('offline'); await expect(second).rejects.toThrow()
    expect(await tracker.readyForCollection()).toBe(false)
    expect(db.store.closed).not.toHaveBeenCalled()
  })

  it('does not accept operations before recovery or after recovery fails', async () => {
    const db = memoryStore(); const tracker = new QaRoomActivity(db.store)
    await expect(tracker.opened('lesson')).rejects.toThrow()
    expect(await tracker.readyForCollection()).toBe(false)
    const failed = new QaRoomActivity({ ...db.store, async recoverInterrupted() { throw Error('offline') } })
    await expect(failed.start()).rejects.toThrow('offline')
    expect(await failed.readyForCollection()).toBe(false)
  })
})
