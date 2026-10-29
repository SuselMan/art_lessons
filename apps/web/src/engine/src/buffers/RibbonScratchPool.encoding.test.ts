import { expect, it } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { RibbonScratchPool } from './RibbonScratchPool'

it('reuses each encoding separately under one shared scratch byte accounting', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const pool = new RibbonScratchPool(gl)
  const pm = pool.acquire(2, 2), straight = pool.acquire(2, 2, 'straight-rgba8')
  expect(pm.pixelEncoding).toBe('premultiplied-rgba8')
  expect(straight.pixelEncoding).toBe('straight-rgba8')
  expect(pool.bytes).toEqual({ live: 32, free: 0 })
  pool.release(pm); pool.release(straight)
  expect(pool.bytes).toEqual({ live: 0, free: 32 })
  const nextStraight = pool.acquire(2, 2, 'straight-rgba8'), nextPm = pool.acquire(2, 2)
  expect(nextStraight).toBe(straight); expect(nextPm).toBe(pm)
  expect(pool.bytes).toEqual({ live: 32, free: 0 })
  expect(() => nextStraight.beginDraw()).toThrow('Premultiplied')
  pool.release(nextStraight); pool.release(nextPm)
  pool.trimFree()
  expect(pool.bytes).toEqual({ live: 0, free: 0 })
  pool.destroy()
})
