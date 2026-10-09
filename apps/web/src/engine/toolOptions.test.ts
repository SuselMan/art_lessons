import { describe, it, expect } from 'vitest'
import * as options from './toolOptions'
import { DEFAULT_GRAPHITE_COLOR, PENCIL_GRADES } from './src/presets/pencilPresets'
import { CHARCOAL_FEEL } from './src/presets/charcoalFeel'
import { PENCIL_TILT } from './src/presets/pencilTilt'
import { brushPenWidth } from './src/presets/brushPenPresets'
import { tiltResponseT } from './src/presets/tiltCurve'

describe('UI options retain authoritative identities', () => {
  it('retains mutable config objects, the single graphite tuple and exact curve functions', () => {
    expect(options.DEFAULT_GRAPHITE_COLOR).toBe(DEFAULT_GRAPHITE_COLOR)
    expect(options.DEFAULT_GRAPHITE_COLOR).toEqual([0.14, 0.14, 0.17])
    expect(options.PENCIL_GRADES).toBe(PENCIL_GRADES)
    expect(options.CHARCOAL_FEEL).toBe(CHARCOAL_FEEL)
    expect(options.PENCIL_TILT).toBe(PENCIL_TILT)
    expect(options.brushPenWidth).toBe(brushPenWidth)
    expect(options.tiltResponseT).toBe(tiltResponseT)
  })
})
