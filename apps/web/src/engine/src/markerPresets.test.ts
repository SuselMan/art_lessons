import { describe, expect, it } from 'vitest'

import { LINER_DAB_SHAPING } from './dabShaping'
import {
  MARKER_BULLET_DAB_SHAPING, chiselDabShaping,
  markerNibFromPreset, shapingForMarkerPreset,
} from './markerPresets'

const FIXED_ANGLE = Math.PI / 4 // arbitrary fixture angle — not the old hardcoded ADR 004 default, just a test value
const MARKER_CHISEL_DAB_SHAPING = chiselDabShaping(FIXED_ANGLE, false)

describe('markerNibFromPreset (#251, ADR 004 §1)', () => {
  it('parses the nib token out of the "${nib}:${size}" preset string #252 sends', () => {
    expect(markerNibFromPreset('bullet:0.3')).toBe('bullet')
    expect(markerNibFromPreset('chisel:0.3')).toBe('chisel')
  })

  it('falls back to bullet for an unrecognized or missing token', () => {
    expect(markerNibFromPreset('chsel:0.3')).toBe('bullet') // typo'd nib
    expect(markerNibFromPreset('HB')).toBe('bullet')        // a pencil grade leaking in
    expect(markerNibFromPreset(undefined)).toBe('bullet')
    expect(markerNibFromPreset('')).toBe('bullet')
  })
})

describe('MARKER_BULLET_DAB_SHAPING (#251, ADR 004 §1: reuse liner\'s curve as-is)', () => {
  it('matches LINER_DAB_SHAPING\'s own weak pressure response exactly', () => {
    for (const pressure of [0, 0.25, 0.5, 0.75, 1]) {
      expect(MARKER_BULLET_DAB_SHAPING.size(pressure)).toBeCloseTo(LINER_DAB_SHAPING.size(pressure))
    }
  })

  it('matches LINER_DAB_SHAPING\'s own mild tilt->aspect response exactly', () => {
    for (const tiltNorm of [0, 0.3, 0.6, 1, 1.5]) {
      expect(MARKER_BULLET_DAB_SHAPING.aspect(tiltNorm)).toBeCloseTo(LINER_DAB_SHAPING.aspect(tiltNorm))
    }
  })

  it('matches LINER_DAB_SHAPING\'s own default tilt-or-path angle formula exactly', () => {
    const cases: Array<[number, number, number, number]> = [
      [10, 10, 0, 1.2345],   // low tilt magnitude -> path angle wins
      [30, 21.21, 21.21, 1.2345], // high tilt magnitude -> tilt direction wins
    ]
    for (const [tiltMag, tiltX, tiltY, pathAngle] of cases) {
      expect(MARKER_BULLET_DAB_SHAPING.angle(tiltMag, tiltX, tiltY, pathAngle))
        .toBeCloseTo(LINER_DAB_SHAPING.angle(tiltMag, tiltX, tiltY, pathAngle))
    }
  })
})

describe('MARKER_CHISEL_DAB_SHAPING (#251, ADR 004 §1: fixed aspect + fixed angle)', () => {
  it('has the same weak pressure response as bullet/liner (ADR 004 §2)', () => {
    for (const pressure of [0, 0.5, 1]) {
      expect(MARKER_CHISEL_DAB_SHAPING.size(pressure)).toBeCloseTo(MARKER_BULLET_DAB_SHAPING.size(pressure))
    }
  })

  it('ignores tiltNorm entirely — a fixed elongation somewhere in the ADR\'s 4-6:1 range', () => {
    for (const tiltNorm of [0, 0.5, 1, 3, -2]) {
      expect(MARKER_CHISEL_DAB_SHAPING.aspect(tiltNorm)).toBeGreaterThanOrEqual(4)
      expect(MARKER_CHISEL_DAB_SHAPING.aspect(tiltNorm)).toBeLessThanOrEqual(6)
    }
    // Genuinely constant, not just "within range" by coincidence.
    const values = [0, 0.5, 1, 3, -2].map(t => MARKER_CHISEL_DAB_SHAPING.aspect(t))
    expect(new Set(values.map(v => v.toFixed(6))).size).toBe(1)
  })

  it('ignores tilt and path direction entirely for angle when followStrokeDirection is false, always returning the fixed angle', () => {
    const fixed = MARKER_CHISEL_DAB_SHAPING.angle(0, 0, 0, 0)
    expect(fixed).toBeCloseTo(FIXED_ANGLE)
    // Strong, opposite-direction tilt and a very different path angle: still the same fixed value.
    expect(MARKER_CHISEL_DAB_SHAPING.angle(90, -90, -90, Math.PI)).toBeCloseTo(fixed)
    expect(MARKER_CHISEL_DAB_SHAPING.angle(50, 30, 40, -1.2)).toBeCloseTo(fixed)
  })
})

// #278: chisel's angle used to be permanently fixed (ADR 004 §1) — now
// optionally follows the stroke's own path-tangent angle, offset by the
// configured angle, same as MARKER_BULLET_DAB_SHAPING's tiltOrPathAngle
// falls back to pathAngle when tilt is small, just always path-relative.
describe('chiselDabShaping followStrokeDirection (#278)', () => {
  it('adds the configured angle as an offset to the path-tangent angle when true', () => {
    const following = chiselDabShaping(FIXED_ANGLE, true)
    expect(following.angle(0, 0, 0, 0)).toBeCloseTo(FIXED_ANGLE)
    expect(following.angle(90, -90, -90, Math.PI)).toBeCloseTo(Math.PI + FIXED_ANGLE)
    expect(following.angle(50, 30, 40, -1.2)).toBeCloseTo(-1.2 + FIXED_ANGLE)
  })

  it('still ignores tilt entirely even in follow mode — only pathAngle and the offset matter', () => {
    const following = chiselDabShaping(FIXED_ANGLE, true)
    expect(following.angle(90, -90, -90, 0.5)).toBeCloseTo(following.angle(0, 0, 0, 0.5))
  })
})

describe('shapingForMarkerPreset (#251, #278)', () => {
  it('dispatches bullet/chisel by the parsed nib token', () => {
    expect(shapingForMarkerPreset('bullet:0.3')).toBe(MARKER_BULLET_DAB_SHAPING)
    const chisel = shapingForMarkerPreset('chisel:0.5', { angle: FIXED_ANGLE, followStrokeDirection: false })
    expect(chisel.angle(0, 0, 0, 0)).toBeCloseTo(FIXED_ANGLE)
    expect(chisel.aspect(0)).toBeCloseTo(MARKER_CHISEL_DAB_SHAPING.aspect(0))
  })

  it('falls back to bullet for an unrecognized/missing token', () => {
    expect(shapingForMarkerPreset('unknown:1')).toBe(MARKER_BULLET_DAB_SHAPING)
    expect(shapingForMarkerPreset(undefined)).toBe(MARKER_BULLET_DAB_SHAPING)
  })

  it('falls back to the ADR 004 default (~45°, absolute) when chisel is dispatched with no angle config', () => {
    const chisel = shapingForMarkerPreset('chisel:0.5')
    expect(chisel.angle(90, -90, -90, Math.PI)).toBeCloseTo(Math.PI / 4)
  })
})
