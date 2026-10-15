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
  for (const model of ['front8-v1', 'front8-fine-v1', 'front8-fine-large-v1', 'front8-detail-v1', 'front8-detail-flow-v1', 'front8-detail-flow-v2', 'front8-detail-flow-v3', 'front8-detail-flow-v4'] as const) it(`persists ${model} without changing recorded brush and pigment settings`, () => {
    const legacy = watercolorPresetString('soft', { water: .7, pigment: .4 }, 'PY35', 'round')
    const next = withWatercolorModel(legacy, model)
    expect(next).toBe(legacy + ':wc@' + model)
    expect(withWatercolorModel(next, model)).toBe(next)
    expect(watercolorModelFromPreset(next)).toBe(model)
    expect(watercolorMixFromPreset(next)).toEqual(watercolorMixFromPreset(legacy))
    expect(ribbonProfileFor('watercolor', next).materialModel).toBe(model)
    expect(watercolorWashSignature(next, [0, 1, 0])).not.toBe(watercolorWashSignature(legacy, [0, 1, 0]))
  })
  it('rejects an unsupported recorded model instead of silently repainting it', () => {
    expect(() => watercolorModelFromPreset('normal:100:69:PB15:round:wc@front8-v2')).toThrow('Unsupported watercolor model')
  })
})

it('keeps coarse and fine front washes separate', () => {
  expect(watercolorWashSignature('normal:100:69:PB29:round:wc@front8-fine-v1', [1,0,0])).not.toBe(watercolorWashSignature('normal:100:69:PB29:round:wc@front8-v1', [1,0,0]))
})
