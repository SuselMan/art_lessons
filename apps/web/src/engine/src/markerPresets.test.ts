import { describe, expect, it } from 'vitest'

import { LINER_DAB_SHAPING } from './dabShaping'
import {
  MARKER_BULLET_DAB_SHAPING, MARKER_CHISEL_DAB_SHAPING,
  markerNibFromPreset, shapingForMarkerPreset,
} from './markerPresets'

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

  it('ignores tilt and path direction entirely for angle, always returning the same fixed angle', () => {
    const fixed = MARKER_CHISEL_DAB_SHAPING.angle(0, 0, 0, 0)
    // Strong, opposite-direction tilt and a very different path angle: still the same fixed value.
    expect(MARKER_CHISEL_DAB_SHAPING.angle(90, -90, -90, Math.PI)).toBeCloseTo(fixed)
    expect(MARKER_CHISEL_DAB_SHAPING.angle(50, 30, 40, -1.2)).toBeCloseTo(fixed)
  })
})

describe('shapingForMarkerPreset (#251)', () => {
  it('dispatches bullet/chisel by the parsed nib token', () => {
    expect(shapingForMarkerPreset('bullet:0.3')).toBe(MARKER_BULLET_DAB_SHAPING)
    expect(shapingForMarkerPreset('chisel:0.5')).toBe(MARKER_CHISEL_DAB_SHAPING)
  })

  it('falls back to bullet for an unrecognized/missing token', () => {
    expect(shapingForMarkerPreset('unknown:1')).toBe(MARKER_BULLET_DAB_SHAPING)
    expect(shapingForMarkerPreset(undefined)).toBe(MARKER_BULLET_DAB_SHAPING)
  })
})
