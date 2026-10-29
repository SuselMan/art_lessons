import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'
import { RibbonScratchPool } from './RibbonScratchPool'

function setup() {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  return { mock, gl, pool: new RibbonScratchPool(gl) }
}

it('tracks physical mip storage across live, free, invalidation and reuse without GL work', () => {
  const { gl, pool } = setup(), buffer = pool.acquire(4, 4)
  expect(pool.bytes).toEqual({ live: 64, free: 0 })
  buffer.ensureMipmaps()
  expect(pool.bytes).toEqual({ live: 84, free: 0 })
  buffer.beginReplaceDraw() // stale content does not deallocate mip storage
  const query = vi.spyOn(gl, 'getParameter'), alloc = vi.spyOn(gl, 'texImage2D')
  const first = pool.gpuAllocationSnapshot()
  expect(first).toEqual([{ buffer, state: 'live', bytes: 84 }])
  expect(Object.isFrozen(first)).toBe(true)
  expect(Object.isFrozen(first[0])).toBe(true)
  expect(query).not.toHaveBeenCalled(); expect(alloc).not.toHaveBeenCalled()
  pool.release(buffer)
  expect(pool.bytes).toEqual({ live: 0, free: 84 })
  expect(pool.gpuAllocationSnapshot()).toEqual([{ buffer, state: 'free', bytes: 84 }])
  expect(pool.acquire(4, 4)).toBe(buffer)
  expect(first[0]!.state).toBe('live')
  expect(pool.gpuAllocationSnapshot()).toHaveLength(1)
  pool.release(buffer); pool.trimFree()
  expect(buffer.storageByteLength).toBe(0)
  expect(pool.gpuAllocationSnapshot()).toEqual([])
})

it('reports separate actual encoding/filter allocations and trims only idle ones', () => {
  const { pool } = setup(), nearest = pool.acquire(2, 2), linear = pool.acquire(2, 2, 'premultiplied-rgba8', 'linear')
  const straight = pool.acquire(2, 2, 'straight-rgba8')
  expect(new Set(pool.gpuAllocationSnapshot().map(e => e.buffer)).size).toBe(3)
  pool.release(linear); pool.release(straight); pool.trimFree()
  expect(pool.gpuAllocationSnapshot()).toEqual([{ buffer: nearest, state: 'live', bytes: 16 }])
  expect(linear.storageByteLength).toBe(0); expect(straight.storageByteLength).toBe(0)
  pool.release(nearest); pool.destroy()
})

it('enforces the existing idle ceiling using actual allocated mip bytes', () => {
  const { pool } = setup(), buffers = Array.from({ length: 4 }, () => pool.acquire(2048, 2048))
  for (const b of buffers) b.ensureMipmaps()
  for (const b of buffers) pool.release(b)
  expect(buffers[3]!.storageByteLength).toBe(0)
  expect(pool.gpuAllocationSnapshot()).toHaveLength(3)
  expect(pool.bytes.free).toBe(3 * 22369620)
  pool.destroy()
})

it('holding and trimToCeiling retain then trim mip-aware allocations', () => {
  const { pool } = setup(); pool.holding = true
  const buffers = Array.from({ length: 4 }, () => pool.acquire(2048, 2048))
  for (const b of buffers) { b.ensureMipmaps(); pool.release(b) }
  expect(pool.bytes.free).toBe(4 * 22369620)
  pool.holding = false; pool.trimToCeiling()
  expect(pool.gpuAllocationSnapshot()).toHaveLength(3)
  expect(pool.bytes.free).toBeLessThanOrEqual(64 * 1024 * 1024)
  pool.destroy()
})

it('preserves destroy borrowed semantics and forget does not issue deletes', () => {
  const { gl, pool } = setup(), borrowed = pool.acquire(2, 2), idle = pool.acquire(2, 2)
  pool.release(idle); pool.destroy()
  expect(idle.storageByteLength).toBe(0)
  expect(borrowed.storageByteLength).toBe(16) // borrower remains responsible
  expect(pool.bytes).toEqual({ live: 0, free: 0 })
  borrowed.destroy()
  const a = pool.acquire(4, 4), b = pool.acquire(4, 4); pool.release(b)
  const deletion = vi.spyOn(gl, 'deleteTexture')
  pool.forget()
  expect(deletion).not.toHaveBeenCalled()
  expect(pool.gpuAllocationSnapshot()).toEqual([])
  expect(pool.bytes).toEqual({ live: 0, free: 0 })
  a.destroy(); b.destroy() // mock context is alive; actual loss owner forgets it
})

it('rejects unknown, duplicate and old-lifetime releases before mutation or deletion', () => {
  const { gl, pool } = setup(), foreign = new AccumulationBuffer(gl, 4, 4, 'nearest')
  const deletion = vi.spyOn(gl, 'deleteTexture'), borrowed = pool.acquire(4, 4)
  const before = pool.gpuAllocationSnapshot()
  expect(() => pool.release(foreign)).toThrow('Unknown')
  expect(pool.gpuAllocationSnapshot()).toEqual(before)
  pool.release(borrowed)
  expect(() => pool.release(borrowed)).toThrow('already released')
  expect(pool.gpuAllocationSnapshot()).toHaveLength(1)
  expect(deletion).not.toHaveBeenCalled()
  const again = pool.acquire(4, 4)
  expect(again).toBe(borrowed)
  pool.forget()
  const fresh = pool.acquire(4, 4), freshSnapshot = pool.gpuAllocationSnapshot()
  expect(() => pool.release(again)).toThrow('Unknown')
  expect(pool.gpuAllocationSnapshot()).toEqual(freshSnapshot)
  pool.destroy()
  expect(() => pool.release(fresh)).toThrow('Unknown')
  foreign.destroy(); again.destroy(); fresh.destroy()
})
