import { describe, expect, it } from 'vitest'
import { ribbonProfileFor } from '../dabs/ribbonProfile'
import { watercolorMixFromPreset, watercolorModelFromPreset, watercolorPresetString, watercolorWashSignature, withWatercolorModel } from './watercolorPresets'

describe('recorded watercolor material version', () => {
  it('keeps legacy presets and legacy wash identity unchanged', () => {
    for (const preset of ['normal', 'normal:100:69:PB15:round']) {
      expect(withWatercolorModel(preset, 'legacy')).toBe(preset)
      expect(watercolorModelFromPreset(preset)).toBe('legacy')
      expect(watercolorWashSignature(preset, [1, 0, 0])).toBe('wc')
    }
  })
  it.each(['front8-v1', 'front8-v2'] as const)('persists %s material without changing recorded brush and pigment settings', (model) => {
    const legacy = watercolorPresetString('soft', { water: .7, pigment: .4 }, 'PY35', 'round')
    const next = withWatercolorModel(legacy, model)
    expect(next).toBe(legacy + `:wc@${model}`)
    expect(withWatercolorModel(next, model)).toBe(next)
    expect(watercolorModelFromPreset(next)).toBe(model)
    expect(watercolorMixFromPreset(next)).toEqual(watercolorMixFromPreset(legacy))
    expect(ribbonProfileFor('watercolor', next).materialModel).toBe(model)
    expect(watercolorWashSignature(next, [0, 1, 0])).not.toBe(watercolorWashSignature(legacy, [0, 1, 0]))
  })
  it('keeps v1 and v2 in separate washes', () => {
    const preset = 'normal:100:60:PB29:chisel'
    expect(watercolorWashSignature(withWatercolorModel(preset, 'front8-v1'), [1, 0, 0]))
      .not.toBe(watercolorWashSignature(withWatercolorModel(preset, 'front8-v2'), [1, 0, 0]))
  })
  it('rejects an unsupported recorded model instead of silently repainting it', () => {
    expect(() => watercolorModelFromPreset('normal:100:69:PB15:round:wc@front8-v99')).toThrow('Unsupported watercolor model')
  })
})
