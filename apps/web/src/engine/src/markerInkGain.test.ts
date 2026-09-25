import { describe, expect, it } from 'vitest'

import type { Dab } from '@grafetto/shared'

import { MARKER_INK_REF_CHORD_PX, markerThinNibInkGain } from './markerInkGain'
import { nibGeometry, nibMeanChord } from './markerRibbon'

function dab(opts: Partial<Dab> = {}): Dab {
  return { x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, size: 20, aspectRatio: 1, angle: 0, opacity: 1, t: 0, ...opts }
}

/** The toolbar's chisel at `size` px: short axis size/5, 5:1, rounded box with
 *  the marker's own corner fraction (ribbonProfile.ts). */
function chisel(size: number, angle: number) {
  return nibGeometry(dab({ size: size / 5, aspectRatio: 5, angle }), 1, 'roundedBox', 0.28)
}

describe('markerThinNibInkGain (#559)', () => {
  it('is exactly 1 for a nib whose chord along the travel is at or above the reference', () => {
    // A 40px bullet: chord πr/2 ≈ 15.7 px, far past the reference.
    expect(markerThinNibInkGain(nibGeometry(dab({ size: 40 }), 1), 1, 0, MARKER_INK_REF_CHORD_PX)).toBe(1)
    // A 50px chisel (the default) drawn broad-side: chord = its 10px short axis.
    expect(markerThinNibInkGain(chisel(50, Math.PI / 2), 1, 0, MARKER_INK_REF_CHORD_PX)).toBe(1)
  })

  it('raises the deposit of a chisel dragged broad-side by ref / short-axis chord', () => {
    const nib = chisel(8, Math.PI / 2) // long axis along y, travel along x
    const chord = nibMeanChord(nib, 1, 0)
    expect(chord).toBeLessThan(1.7)
    expect(markerThinNibInkGain(nib, 1, 0, MARKER_INK_REF_CHORD_PX)).toBeCloseTo(MARKER_INK_REF_CHORD_PX / chord, 9)
  })

  it('leaves the same chisel alone when dragged along its long axis', () => {
    // Along y the chord is the full 8px — this is the direction that already
    // read solid in the measurement, and it must not change.
    expect(markerThinNibInkGain(chisel(8, Math.PI / 2), 0, 1, MARKER_INK_REF_CHORD_PX)).toBe(1)
  })

  it('does not care about the direction vector’s length or sign', () => {
    const nib = chisel(8, Math.PI / 2)
    const g = markerThinNibInkGain(nib, 1, 0, MARKER_INK_REF_CHORD_PX)
    expect(markerThinNibInkGain(nib, 37, 0, MARKER_INK_REF_CHORD_PX)).toBeCloseTo(g, 12)
    expect(markerThinNibInkGain(nib, -0.01, 0, MARKER_INK_REF_CHORD_PX)).toBeCloseTo(g, 12)
  })

  it('is continuous across the reference chord (no visible step at the boundary)', () => {
    // A round nib whose chord πr/2 sits just under and just over the reference.
    const r = (2 * MARKER_INK_REF_CHORD_PX) / Math.PI
    const under = markerThinNibInkGain(nibGeometry(dab({ size: 2 * r * 0.999 }), 1), 1, 0, MARKER_INK_REF_CHORD_PX)
    const over = markerThinNibInkGain(nibGeometry(dab({ size: 2 * r * 1.001 }), 1), 1, 0, MARKER_INK_REF_CHORD_PX)
    expect(over).toBe(1)
    expect(under).toBeGreaterThan(1)
    expect(under).toBeLessThan(1.01)
  })

  it('leaves the legacy deposit alone when there is no direction (first dab, tap, dwell tick)', () => {
    // Not the thinnest chord: live and replay can disagree about whether a
    // next dab exists yet, and the first stamp must ink the same either way.
    expect(markerThinNibInkGain(chisel(8, 0.7), 0, 0, MARKER_INK_REF_CHORD_PX)).toBe(1)
  })

  it('is switched off by a zero reference', () => {
    expect(markerThinNibInkGain(chisel(8, Math.PI / 2), 1, 0, 0)).toBe(1)
  })
})
