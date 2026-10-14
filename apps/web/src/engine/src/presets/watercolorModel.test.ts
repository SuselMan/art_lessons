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
  it('persists the material without changing recorded brush and pigment settings', () => {
    const legacy = watercolorPresetString('soft', { water: .7, pigment: .4 }, 'PY35', 'round')
    const next = withWatercolorModel(legacy, 'front8-v1')
    expect(next).toBe(legacy + ':wc@front8-v1')
    expect(withWatercolorModel(next, 'front8-v1')).toBe(next)
    expect(watercolorModelFromPreset(next)).toBe('front8-v1')
    expect(watercolorMixFromPreset(next)).toEqual(watercolorMixFromPreset(legacy))
    expect(ribbonProfileFor('watercolor', next).materialModel).toBe('front8-v1')
    expect(watercolorWashSignature(next, [0, 1, 0])).not.toBe(watercolorWashSignature(legacy, [0, 1, 0]))
  })
  it('rejects an unsupported recorded model instead of silently repainting it', () => {
    expect(() => watercolorModelFromPreset('normal:100:69:PB15:round:wc@front8-v2')).toThrow('Unsupported watercolor model')
  })
})
