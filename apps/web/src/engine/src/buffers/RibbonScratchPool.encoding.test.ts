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

it('keeps linear presentation separate from nearest paint scratch under the same pool budget', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, pool = new RibbonScratchPool(gl)
  const paint = pool.acquire(2, 2), presentation = pool.acquire(2, 2, 'premultiplied-rgba8', 'linear')
  const straight = pool.acquire(2, 2, 'straight-rgba8')
  expect(paint.samplingFilter).toBe('nearest'); expect(presentation.samplingFilter).toBe('linear')
  expect(mock.getMinFilter(paint.texture)).toBe(mock.NEAREST)
  expect(mock.getMinFilter(presentation.texture)).toBe(mock.LINEAR)
  expect(pool.bytes).toEqual({ live: 48, free: 0 })
  pool.release(paint); pool.release(presentation); pool.release(straight)
  expect(pool.bytes).toEqual({ live: 0, free: 48 })
  const a = pool.acquire(2, 2, 'premultiplied-rgba8', 'linear'), b = pool.acquire(2, 2), c = pool.acquire(2, 2, 'straight-rgba8')
  expect(a).toBe(presentation); expect(b).toBe(paint); expect(c).toBe(straight)
  pool.release(a); pool.release(b); pool.release(c)
  pool.trimFree(); expect(pool.bytes).toEqual({ live: 0, free: 0 }); pool.destroy()
})
it('rejects a non-exact straight sampler or unknown filter before changing pool accounting', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext, pool = new RibbonScratchPool(gl)
  expect(() => pool.acquire(2, 2, 'straight-rgba8', 'linear')).toThrow('sampling policy')
  expect(() => pool.acquire(2, 2, 'premultiplied-rgba8', 'unknown' as never)).toThrow('sampling policy')
  expect(pool.bytes).toEqual({ live: 0, free: 0 }); pool.destroy()
})
