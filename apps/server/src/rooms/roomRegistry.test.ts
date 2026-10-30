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

describe('settled write outcomes', () => {
  it('reports a deferred result without changing the room queue order', async () => {
    let resolve!: (value: number) => void
    const order: string[] = []
    const first=enqueueWrite('outcome-room',()=>new Promise<number>(r=>{resolve=r}))
    const second=enqueueWrite('outcome-room',async()=>{order.push('second');return 2})
    let settled=false;first.then(()=>{settled=true})
    await Promise.resolve();expect(settled).toBe(false);expect(order).toEqual([])
    resolve(17)
    expect(await first).toEqual({ok:true,value:17})
    expect(await second).toEqual({ok:true,value:2})
    await flushRoomWrites('outcome-room');expect(order).toEqual(['second'])
    expect(pendingWriteOf('outcome-room')).toBeUndefined()
  })
  it('returns failures as data, keeps later writes running, and ignored outcomes never reject', async () => {
    const log=vi.spyOn(console,'error').mockImplementation(()=>{}),unhandled=vi.fn()
    process.on('unhandledRejection',unhandled)
    try {
      const error=new Error('deferred write failed')
      const failed=enqueueWrite('outcome-fail',()=>Promise.reject(error))
      enqueueWrite('outcome-fail',()=>{throw new Error('ignored synchronous writer failure')})
      const later=enqueueWrite('outcome-fail',async()=>42)
      expect(await failed).toEqual({ok:false,error})
      expect(await later).toEqual({ok:true,value:42})
      await flushRoomWrites('outcome-fail');await new Promise(resolve=>setImmediate(resolve))
      expect(unhandled).not.toHaveBeenCalled();expect(log).toHaveBeenCalledTimes(2)
      expect(pendingWriteOf('outcome-fail')).toBeUndefined()
    }finally{process.off('unhandledRejection',unhandled);log.mockRestore()}
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
