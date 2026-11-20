import { describe, expect, it } from 'vitest'
import { nativePaperPreset } from './nativePaper'
import { presetForTool } from './resolvePreset'
import { charcoalNibFromPreset, charcoalPresetFor } from './charcoalPresets'

describe('native Flat deposit profile (#857)', () => {
  it('leaves old recorded strokes unchanged and marks only new native Flat presets', () => {
    expect(presetForTool('pencil', '6B').nativeFinePaper).toBeUndefined()
    expect(presetForTool('pencil', nativePaperPreset('pencil', 'flat', '6B')))
      .toEqual({ ...presetForTool('pencil', '6B'), nativeFinePaper: true })
    expect(nativePaperPreset('digitalBrush', 'flat', 'brush:imported-example@1')).toBe('brush:imported-example@1')
    expect(nativePaperPreset('pencil', 'fine', '6B')).toBe('6B')
  })
  it('preserves charcoal material and nib through the profile prefix', () => {
    const preset = nativePaperPreset('charcoal', 'flat', 'compressed:chisel')
    expect(charcoalPresetFor(preset)).toEqual(charcoalPresetFor('compressed:chisel'))
    expect(charcoalNibFromPreset(preset)).toBe('chisel')
    expect(nativePaperPreset('charcoal', 'flat', preset)).toBe(preset)
  })
})
