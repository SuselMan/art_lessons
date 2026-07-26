import { describe, expect, it } from 'vitest'

import { PENCIL_PRESETS } from './pencilPresets'
import {
  CHARCOAL_PRESETS, CHARCOAL_TYPES, DEFAULT_CHARCOAL_TYPE,
  charcoalPresetFor, isCharcoalType, type CharcoalPreset,
} from './charcoalPresets'

// #304 / ADR 005. The individual numbers here are explicitly first-pass and
// uncalibrated (see the table's own comment), so asserting any exact value
// would just pin down something meant to be retuned by eye on real hardware.
// What these tests protect is the *structure* the ADR actually commits to and
// that a retune could silently break: a monotonic loose->dense axis across all
// six fields, charcoal reacting to paper more strongly than any graphite grade,
// and a resolve that never falls through to a pencil.

const ORDER: readonly (keyof CharcoalPreset)[] = ['opacity', 'hardness', 'sizeMultiplier']
const REVERSE: readonly (keyof CharcoalPreset)[] = ['tooth', 'crumble', 'dust']

describe('charcoal presets (#304, ADR 005)', () => {
  it('lists the three real charcoal types, loose to dense', () => {
    expect(CHARCOAL_TYPES).toEqual(['vine', 'willow', 'compressed'])
  })

  // ADR 005 §8: the three types must read as one axis "loose/light ->
  // dense/black", not three unrelated bundles of numbers. Every field is
  // monotonic along CHARCOAL_TYPES' own order — the direction differs per
  // field, but no field may wobble.
  it.each(ORDER)('rises monotonically from vine to compressed: %s', field => {
    const values = CHARCOAL_TYPES.map(t => CHARCOAL_PRESETS[t][field])
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(values[0]).toBeLessThan(values[2])
  })

  it.each(REVERSE)('falls monotonically from vine to compressed: %s', field => {
    const values = CHARCOAL_TYPES.map(t => CHARCOAL_PRESETS[t][field])
    expect(values).toEqual([...values].sort((a, b) => b - a))
    expect(values[0]).toBeGreaterThan(values[2])
  })

  // ADR 005 §4: tooth > 1 is what makes the contrast expansion in DAB_FRAG an
  // expansion at all — at exactly 1 the branch would reduce to graphite's own
  // paperCatch handling, silently erasing the single most characteristic
  // difference between the two materials.
  it('expands the paper tooth for every type, never merely matching graphite', () => {
    for (const type of CHARCOAL_TYPES) {
      expect(CHARCOAL_PRESETS[type].tooth).toBeGreaterThan(1)
    }
  })

  // The whole premise of ADR 005: this is not a soft black pencil.
  //
  // Compared against 2B, not 6B, and that choice is deliberate — see ADR 005
  // §3. H/HB/2B are PENCIL_PRESETS' three hand-calibrated anchors; everything
  // softer than 2B is extrapolated and pinned to BOUNDS.opacity's 0.95 ceiling
  // (the curve wanted 1.09 at 6B), which is why 5B and 6B currently hold the
  // identical value. Asserting against that clamp artifact would be measuring
  // pencilPresets.ts's tail behavior, not charcoal's covering power — and
  // charcoal's real advantage isn't raw opacity anyway, it's opacity times the
  // expanded tooth (§4), which is not observable in this table alone.
  it('covers faster than the darkest calibrated graphite grade', () => {
    expect(CHARCOAL_PRESETS.compressed.opacity).toBeGreaterThan(PENCIL_PRESETS['2B'].opacity)
    // Vine is deliberately the opposite end — a light sketching material that
    // must NOT out-cover graphite. Guards against a future retune quietly
    // collapsing the three types toward each other.
    expect(CHARCOAL_PRESETS.vine.opacity).toBeLessThan(PENCIL_PRESETS['2B'].opacity)
  })

  it('narrows a string to a charcoal type', () => {
    expect(isCharcoalType('willow')).toBe(true)
    expect(isCharcoalType('Willow')).toBe(false)
    expect(isCharcoalType('6B')).toBe(false)
    expect(isCharcoalType('')).toBe(false)
  })

  it('resolves each known type to its own preset', () => {
    for (const type of CHARCOAL_TYPES) {
      expect(charcoalPresetFor(type)).toBe(CHARCOAL_PRESETS[type])
    }
  })

  // A stroke recorded by a future client with a type this build doesn't know
  // must still render as *charcoal*, not silently as an HB pencil — the same
  // reason _resolvePreset falls back to PENCIL_PRESETS['HB'] rather than
  // throwing, but landing inside the right material.
  it('falls back to the middle type for anything unrecognized', () => {
    expect(DEFAULT_CHARCOAL_TYPE).toBe('willow')
    for (const unknown of ['', 'soft-vine', '6B', 'bullet:12']) {
      expect(charcoalPresetFor(unknown)).toBe(CHARCOAL_PRESETS[DEFAULT_CHARCOAL_TYPE])
    }
  })
})
