import { describe, expect, it } from 'vitest'

import { ScratchFreeList, ScratchSlot, type Poolable } from './scratchPools'

/** (#494) The engine's scratch pools on fake buffers — no WebGL. The rules
 *  were five hand-written copies inside PencilEngine; here each is checked
 *  once. */

class FakeBuf implements Poolable {
  static made = 0
  destroyed = false
  readonly id = ++FakeBuf.made
  readonly width: number
  readonly height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  destroy(): void { this.destroyed = true }
}

describe('ScratchSlot', () => {
  it('hands back the same buffer while the size is the same', () => {
    const slot = new ScratchSlot((w, h) => new FakeBuf(w, h))
    const a = slot.acquire(100, 50)
    expect(slot.acquire(100, 50)).toBe(a)
  })

  // An infinite room's canvas resizes; the old buffer is freed, not leaked.
  it('replaces it, freeing the old one, when the size changes', () => {
    const slot = new ScratchSlot((w, h) => new FakeBuf(w, h))
    const a = slot.acquire(100, 50)
    const b = slot.acquire(200, 50)
    expect(b).not.toBe(a)
    expect(a.destroyed).toBe(true)
    expect(b.width).toBe(200)
  })

  // After a context loss the object is already gone with the context:
  // destroying it would call into a dead handle.
  it('forgets without freeing after a context loss, and makes a new one next time', () => {
    const slot = new ScratchSlot((w, h) => new FakeBuf(w, h))
    const a = slot.acquire(10, 10)
    slot.forget()
    expect(a.destroyed).toBe(false)
    expect(slot.acquire(10, 10)).not.toBe(a)
  })

  it('frees on destroy', () => {
    const slot = new ScratchSlot((w, h) => new FakeBuf(w, h))
    const a = slot.acquire(10, 10)
    slot.destroy()
    expect(a.destroyed).toBe(true)
  })
})

describe('ScratchFreeList', () => {
  it('reuses a released buffer of the exact size, and makes one otherwise', () => {
    const list = new ScratchFreeList((w, h) => new FakeBuf(w, h))
    const a = list.acquire(64, 64)
    list.release(a)
    expect(list.acquire(32, 32)).not.toBe(a)
    expect(list.acquire(64, 64)).toBe(a)
    expect(list.idleCount()).toBe(0)
  })

  // A bake needs many alive at once: nothing is handed out twice.
  it('never hands out a buffer that is still in use', () => {
    const list = new ScratchFreeList((w, h) => new FakeBuf(w, h))
    const a = list.acquire(64, 64)
    const b = list.acquire(64, 64)
    expect(b).not.toBe(a)
  })

  it('forgets idle buffers after a context loss instead of handing out dead ones', () => {
    const list = new ScratchFreeList((w, h) => new FakeBuf(w, h))
    const a = list.acquire(8, 8)
    list.release(a)
    list.forget()
    expect(a.destroyed).toBe(false)
    expect(list.acquire(8, 8)).not.toBe(a)
  })

  it('frees every idle buffer on destroy', () => {
    const list = new ScratchFreeList((w, h) => new FakeBuf(w, h))
    const a = list.acquire(8, 8)
    const b = list.acquire(8, 8)
    list.release(a)
    list.release(b)
    list.destroy()
    expect(a.destroyed && b.destroyed).toBe(true)
    expect(list.idleCount()).toBe(0)
  })
})
