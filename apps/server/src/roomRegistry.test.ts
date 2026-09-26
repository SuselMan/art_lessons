import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  enqueueWrite, flushRoomWrites, lessonRecordOf, pendingWriteCount, pendingWriteOf, rooms, type RoomRecord,
} from './roomRegistry.js'

/** (#612) The bottom of the room store on its own: the write queue every
 *  persist goes through, and the lesson/board rule every social read does. */

afterEach(() => { rooms.clear() })

describe('the write queue', () => {
  it('runs a room’s writes in the order they were queued, one at a time', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    enqueueWrite('r', () => new Promise<void>(resolve => { releaseFirst = () => { order.push('first'); resolve() } }))
    enqueueWrite('r', async () => { order.push('second') })
    await Promise.resolve()
    expect(order).toEqual([])
    releaseFirst()
    await flushRoomWrites('r')
    expect(order).toEqual(['first', 'second'])
  })

  // A failed insert must not strand every later write for the room behind it.
  it('a failed write is logged and the queue goes on', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ran = vi.fn()
    enqueueWrite('r', () => Promise.reject(new Error('boom')))
    enqueueWrite('r', async () => { ran() })
    await flushRoomWrites('r')
    expect(ran).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  // (#292) One entry per room ever written to used to live until restart.
  it('forgets a room once its queue has drained', async () => {
    enqueueWrite('r', async () => {})
    expect(pendingWriteOf('r')).toBeDefined()
    await flushRoomWrites('r')
    await Promise.resolve()
    expect(pendingWriteOf('r')).toBeUndefined()
    expect(pendingWriteCount()).toBe(0)
  })
})

describe('lessonRecordOf', () => {
  const record = (id: string, lessonId: string | null) => ({ room: { id }, lessonId }) as RoomRecord

  it('is the record itself for a lesson, and the lesson for a board', () => {
    const lesson = record('L', null)
    rooms.set('L', lesson)
    expect(lessonRecordOf(lesson)).toBe(lesson)
    expect(lessonRecordOf(record('B', 'L'))).toBe(lesson)
  })

  // Falling back to the board's own empty social state would judge it by an
  // allow-list nobody filled in.
  it('throws for a board whose lesson is not resident', () => {
    expect(() => lessonRecordOf(record('B', 'gone'))).toThrow(/without its lesson/)
  })
})
