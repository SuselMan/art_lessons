import { expect, it } from 'vitest'
import { PencilEngine } from './index'
import { createTestEngine } from './testing/engineTestUtils'

it('latches historical legacy raster interpretation for the lifetime of the engine', () => {
  const { engine } = createTestEngine()
  try {
    expect(engine.rasterVersion).toBe('legacy-pm8-v1')
    expect(Reflect.set(engine, 'rasterVersion', 'straight-rgba8-v1')).toBe(false)
    expect(engine.rasterVersion).toBe('legacy-pm8-v1')
  } finally { engine.destroy() }
})

it('rejects unsupported or corrupt format before touching the canvas or allocating GL resources', () => {
  const canvas = new Proxy({} as HTMLCanvasElement, { get() { throw new Error('Canvas touched before format admission') } })
  expect(() => new PencilEngine(canvas, { rasterVersion: 'straight-rgba8-v1' })).toThrow('not supported by this renderer')
  expect(() => new PencilEngine(canvas, { rasterVersion: 'future' as never })).toThrow('Unsupported room raster version')
})
