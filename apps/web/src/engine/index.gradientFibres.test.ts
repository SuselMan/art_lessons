import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'
import { WatercolorPasses } from './src/raster/WatercolorPasses'

describe('construction-time gradient fibres readiness', () => {
  it('warms only after actual uniform/attribute initialization, once per context', () => {
    const events: string[] = []
    const spies = (['initFieldUniforms', 'initFieldAttributes', 'warmGradientFibres'] as const).map(name => {
      const original = WatercolorPasses.prototype[name]
      return vi.spyOn(WatercolorPasses.prototype, name).mockImplementation(function (this: WatercolorPasses) {
        events.push(name)
        return original.call(this)
      })
    })
    const { engine } = createTestEngine({ gradientFibres: true }, { width: 64, height: 64 })
    try {
      const expected = ['initFieldUniforms', 'initFieldAttributes', 'warmGradientFibres']
      expect(events).toEqual(expected)
      const passes = engine['_watercolorPasses']
      const cached = passes['_gradientField']
      expect(cached).not.toBeNull()
      // No lazy program creation when the first actual marked-field operator runs.
      const create = vi.spyOn(engine.gl, 'createProgram')
      const pool = engine['_ribbonScratchPool']
      const a = pool.acquire(8, 8), b = pool.acquire(8, 8), out = pool.acquire(8, 8)
      try {
        passes.fieldOp(out, a, b, 1, 1, { gradientFibres: true, world: [0, 0, 1] })
        expect(create).not.toHaveBeenCalled()
        expect(passes['_gradientField']).toBe(cached)
      } finally { create.mockRestore(); pool.release(a); pool.release(b); pool.release(out) }
      engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
      engine['_handleContextRestored']()
      expect(events).toEqual([...expected, ...expected])
      expect(passes['_gradientField']).not.toBeNull()
      expect(passes['_gradientField']).not.toBe(cached)
    } finally { engine.destroy(); for (const spy of spies) spy.mockRestore() }
  })

  it('leaves standalone callers without the optional program at boot or restore', () => {
    const warm = vi.spyOn(WatercolorPasses.prototype, 'warmGradientFibres')
    const { engine } = createTestEngine()
    try {
      expect(engine['_wcGradientFibres']).toBe(false)
      expect(engine['_watercolorPasses']['_gradientField']).toBeNull()
      engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
      engine['_handleContextRestored']()
      expect(warm).not.toHaveBeenCalled()
      expect(engine['_watercolorPasses']['_gradientField']).toBeNull()
    } finally { engine.destroy(); warm.mockRestore() }
  })
})
