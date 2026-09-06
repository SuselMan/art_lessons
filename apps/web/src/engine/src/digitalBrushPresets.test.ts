// Unit tests for the digital brush's data model (#547, ADR 013).
//
// Unlike the engine-level tests next door, everything here is genuinely
// checkable: this file is arithmetic and string parsing, with no GL anywhere
// near it. That is itself the point of the design — the brush is *data*, so the
// parts that decide what a mark looks like can be tested without a canvas.
import { describe, expect, it } from 'vitest'

import { DEFAULT_DAB_SPACING_FACTOR } from './dabSpacing'
import {
  brushDabRandom, brushStrokeSeed, curveAt, digitalBrushFlow, digitalBrushFlowFromPreset,
  digitalBrushFromPreset,
  digitalBrushPreset, digitalBrushPresetFor, shapingForDigitalBrushPreset,
  DEFAULT_DIGITAL_BRUSH, DIGITAL_BRUSHES, DIGITAL_BRUSH_IDS,
  type BrushCurve,
} from './digitalBrushPresets'

const RAMP: BrushCurve = [[0, 0.2], [0.5, 0.6], [1, 1]]

describe('curveAt', () => {
  it('returns the authored values at the control points', () => {
    expect(curveAt(RAMP, 0)).toBeCloseTo(0.2, 6)
    expect(curveAt(RAMP, 0.5)).toBeCloseTo(0.6, 6)
    expect(curveAt(RAMP, 1)).toBeCloseTo(1, 6)
  })

  it('interpolates linearly between them', () => {
    expect(curveAt(RAMP, 0.25)).toBeCloseTo(0.4, 6)
    expect(curveAt(RAMP, 0.75)).toBeCloseTo(0.8, 6)
  })

  it('clamps outside the authored range rather than extrapolating', () => {
    // A stylus can report slightly out-of-range pressure, and an extrapolated
    // curve would answer with a negative width or one above the slider.
    expect(curveAt(RAMP, -1)).toBeCloseTo(0.2, 6)
    expect(curveAt(RAMP, 5)).toBeCloseTo(1, 6)
  })

  it('reads two points at the same x as a step, not a division by zero', () => {
    const step: BrushCurve = [[0, 0], [0.5, 0], [0.5, 1], [1, 1]]
    expect(curveAt(step, 0.49)).toBeCloseTo(0, 6)
    expect(curveAt(step, 0.5)).toBeCloseTo(0, 6)
    expect(curveAt(step, 0.51)).toBeCloseTo(1, 6)
    expect(Number.isFinite(curveAt(step, 0.5))).toBe(true)
  })
})

describe('the shipped set', () => {
  it('has a descriptor for every advertised id, and a resolvable default', () => {
    expect(DIGITAL_BRUSH_IDS.length).toBe(DIGITAL_BRUSHES.length)
    for (const id of DIGITAL_BRUSH_IDS) {
      expect(DIGITAL_BRUSHES.some(b => b.id === id)).toBe(true)
    }
    expect(digitalBrushFromPreset(DEFAULT_DIGITAL_BRUSH).id).toBe(DEFAULT_DIGITAL_BRUSH)
  })

  it('carries no duplicate id+version pair', () => {
    // The token is resolved by exactly this pair (ADR 013 §7). Two descriptors
    // answering to one token would make which brush a recorded stroke replays
    // with depend on array order.
    const seen = new Set<string>()
    for (const b of DIGITAL_BRUSHES) {
      const key = `${b.id}@${b.version}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('spaces every brush tighter than the engine default', () => {
    // Not taste: 0.22 was calibrated (#478) against tools whose dabs blend
    // through paper grain and a soft graphite falloff. A digital stamp has
    // neither, so a brush authored at or above that step would show its own
    // ripple as a row of discs.
    for (const b of DIGITAL_BRUSHES) {
      expect(b.spacing).toBeGreaterThan(0)
      expect(b.spacing).toBeLessThan(DEFAULT_DAB_SPACING_FACTOR)
    }
  })

  it('keeps hardness and flow inside the ranges the shader assumes', () => {
    for (const b of DIGITAL_BRUSHES) {
      expect(b.tip.hardness).toBeGreaterThanOrEqual(0)
      // Strictly below 1: at exactly 1 the stamp's ramp would be zero-width and
      // the mark a jagged disc. The shader clamps too; this keeps the authored
      // data honest rather than relying on that.
      expect(b.tip.hardness).toBeLessThan(1)
      expect(b.flow).toBeGreaterThan(0)
      expect(b.flow).toBeLessThanOrEqual(1)
    }
  })

  it('differs in hardness across the set', () => {
    // The set's whole job in v1 is to span the axis a brush set has to span
    // first — how the edge of the mark behaves. Four brushes that all felt the
    // same would be four names for one tool.
    const hardnesses = DIGITAL_BRUSHES.map(b => b.tip.hardness).sort((a, b) => a - b)
    expect(hardnesses[hardnesses.length - 1] - hardnesses[0]).toBeGreaterThan(0.5)
  })
})

describe('the recorded preset token (ADR 013 §7)', () => {
  it('round-trips id and version', () => {
    const token = digitalBrushPreset('hard-round', 1)
    expect(token).toBe('brush:hard-round@1')
    expect(digitalBrushFromPreset(token).id).toBe('hard-round')
  })

  it('resolves a bare id, for the settings layer', () => {
    // The UI remembers which brush is selected and has no business knowing
    // about versions — the token is assembled when a stroke is recorded.
    expect(digitalBrushFromPreset('soft-round').id).toBe('soft-round')
  })

  it('falls back to the default rather than throwing on junk', () => {
    // This runs on the replay path. A hard failure there would take out a whole
    // room's history rather than one mark.
    expect(digitalBrushFromPreset(undefined).id).toBe(DEFAULT_DIGITAL_BRUSH)
    expect(digitalBrushFromPreset('').id).toBe(DEFAULT_DIGITAL_BRUSH)
    expect(digitalBrushFromPreset('brush:nope@1').id).toBe(DEFAULT_DIGITAL_BRUSH)
    expect(digitalBrushFromPreset('vine:chisel').id).toBe(DEFAULT_DIGITAL_BRUSH)
  })

  it('falls back to the id when only the version is unknown', () => {
    // A stroke recorded by a client newer than this one. Drawing it with the
    // same brush at a different version is the closest honest answer; refusing
    // to draw it is not an option, the log is permanent.
    expect(digitalBrushFromPreset('brush:soft-round@99').id).toBe('soft-round')
  })
})

describe('the pressure→density toggle (#547)', () => {
  it('is on for a token that does not mention it', () => {
    // Every stroke recorded before the setting existed. They have to replay as
    // they were drawn, which is the whole reason the modifier marks the *off*
    // case rather than the on one — the log is permanent (ADR 013 §7).
    expect(digitalBrushFlowFromPreset('brush:soft-round@1')).toBe(true)
    expect(digitalBrushFlowFromPreset(undefined)).toBe(true)
    expect(digitalBrushFlowFromPreset('')).toBe(true)
  })

  it('round-trips through the token', () => {
    expect(digitalBrushPreset('soft-round', 1, true)).toBe('brush:soft-round@1')
    expect(digitalBrushPreset('soft-round', 1, false)).toBe('brush:soft-round@1:flat')
    expect(digitalBrushFlowFromPreset(digitalBrushPreset('soft-round', 1, false))).toBe(false)
    expect(digitalBrushFlowFromPreset(digitalBrushPreset('soft-round', 1, true))).toBe(true)
  })

  it('still resolves the brush when the modifier is present', () => {
    // The parser has to see past the third field, or turning the setting off
    // would silently swap the brush for the default.
    expect(digitalBrushFromPreset('brush:flat@1:flat').id).toBe('flat')
    expect(digitalBrushFromPreset('brush:ink-round@1:flat').id).toBe('ink-round')
  })

  it('makes the stamp lay the same amount at any pressure when off', () => {
    for (const b of DIGITAL_BRUSHES) {
      const at = (p: number) => digitalBrushFlow(b, p, false)
      expect(at(0.05)).toBeCloseTo(at(1), 9)
      expect(at(0.5)).toBeCloseTo(at(1), 9)
      // Not "weaker": off means the mark is what a firm press would have given,
      // everywhere — otherwise the toggle would read as a way of turning the
      // brush down rather than of making it even.
      expect(at(0.05)).toBeCloseTo(digitalBrushFlow(b, 1, true), 9)
    }
  })

  it('leaves width alone', () => {
    // The half of the split that must survive the toggle: a stroke that stops
    // fading under a light touch but still thins is a brush behaving; one that
    // stops doing both is a marker.
    const shaping = shapingForDigitalBrushPreset('brush:medium-round@1:flat')
    expect(shaping.size(1, 0)).toBeGreaterThan(shaping.size(0.1, 0))
  })
})

describe('flow (ADR 013 §3)', () => {
  it('never leaves 0..1', () => {
    for (const b of DIGITAL_BRUSHES) {
      for (const p of [0, 0.01, 0.3, 0.5, 0.9, 1]) {
        const f = digitalBrushFlow(b, p)
        expect(f).toBeGreaterThanOrEqual(0)
        expect(f).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never decreases as pressure rises', () => {
    // Pressing harder may stop adding paint, but it must never take some away —
    // a non-monotone flow curve reads as a stroke that gets lighter where the
    // hand leaned in.
    for (const b of DIGITAL_BRUSHES) {
      let prev = -1
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const f = digitalBrushFlow(b, Math.min(p, 1))
        expect(f).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = f
      }
    }
  })

  it('is what separates a building brush from a covering one', () => {
    const soft = digitalBrushFromPreset('soft-round')
    const ink = digitalBrushFromPreset('ink-round')
    // At a middling pressure the soft brush must lay down markedly less per
    // stamp than the ink one, or "build tone in passes" and "cover in one" are
    // the same brush.
    expect(digitalBrushFlow(soft, 0.5)).toBeLessThan(digitalBrushFlow(ink, 0.5) * 0.6)
  })
})

describe('the shaping profile built from a descriptor', () => {
  it('drives size from the brush’s own curve', () => {
    const shaping = shapingForDigitalBrushPreset('soft-round')
    const brush = digitalBrushFromPreset('soft-round')
    expect(shaping.size(0, 0)).toBeCloseTo(curveAt(brush.sizeByPressure, 0), 6)
    expect(shaping.size(1, 0)).toBeCloseTo(curveAt(brush.sizeByPressure, 1), 6)
    expect(shaping.size(1, 0)).toBeGreaterThan(shaping.size(0.1, 0))
  })

  it('never collapses a light touch to nothing', () => {
    // A dab of literally zero width is a gap in the stroke, not a light mark —
    // the same problem BRUSH_PEN_MIN_PRESSURE guards from the other side.
    for (const id of DIGITAL_BRUSH_IDS) {
      expect(shapingForDigitalBrushPreset(id).size(0, 0)).toBeGreaterThan(0)
    }
  })

  it('stays round, and carries the brush’s pressure smoothing', () => {
    const shaping = shapingForDigitalBrushPreset('hard-round')
    expect(shaping.aspect(0, 0)).toBe(1)
    expect(shaping.aspect(0.9, 1)).toBe(1)
    expect(shaping.pressureSmoothingPx).toBe(digitalBrushFromPreset('hard-round').pressureSmoothingPx)
  })

  it('declares no physical-nib behaviour', () => {
    // A digital brush has no fibres to bend and no contact patch to lean off.
    // Inheriting the brush pen's tip model would make the two tools feel like
    // one, which is exactly what ADR 013 §1 is about.
    const shaping = shapingForDigitalBrushPreset('medium-round')
    expect(shaping.tipBend).toBeUndefined()
    expect(shaping.headTaper).toBeUndefined()
    expect(shaping.speedContact).toBeUndefined()
  })
})

describe('the PencilPreset the engine resolves', () => {
  it('passes the brush’s hardness through, since two paths read it', () => {
    // The stamp shader draws by it and the spacing rule tightens by it. If this
    // ever stopped tracking the descriptor, a hard brush would be spaced for a
    // soft one and come out beaded.
    for (const b of DIGITAL_BRUSHES) {
      expect(digitalBrushPresetFor(b.id).hardness).toBeCloseTo(b.tip.hardness, 6)
    }
  })

  it('leaves a round tip at face value and normalizes an elongated one', () => {
    // Not the graded-material scaling this tool refuses to have: it is what
    // makes the size slider mean the same thing across the set. The slider names
    // the widest the mark gets, so a 4:1 flat tip has to divide back down to its
    // short axis or picking it would quadruple the brush.
    for (const b of DIGITAL_BRUSHES) {
      expect(digitalBrushPresetFor(b.id).sizeMultiplier).toBeCloseTo(1 / Math.max(b.tip.aspect, 1), 6)
    }
    expect(digitalBrushPresetFor('hard-round').sizeMultiplier).toBe(1)
    expect(digitalBrushPresetFor('flat').sizeMultiplier).toBeCloseTo(0.25, 6)
  })

  it('draws every brush at a comparable width for one slider value', () => {
    // The property the multiplier exists for, stated as the thing a person would
    // notice: at full pressure the widest part of the mark is the same number of
    // px whichever brush is in hand.
    const width = (id: string): number => {
      const b = digitalBrushFromPreset(id)
      const shaping = shapingForDigitalBrushPreset(id)
      // Dab.size at full pressure, times the render-time multiplier, times the
      // long axis — the same product every paint path applies.
      return shaping.size(1, 0) * digitalBrushPresetFor(id).sizeMultiplier * Math.max(b.tip.aspect, 1)
    }
    const round = width('hard-round')
    for (const id of DIGITAL_BRUSH_IDS) expect(width(id)).toBeCloseTo(round, 6)
  })
})

describe('seeded randomness (ADR 013 §6)', () => {
  it('is a pure function of stroke and dab index', () => {
    const seed = brushStrokeSeed('stroke-abc')
    expect(brushDabRandom(seed, 7)).toBe(brushDabRandom(seed, 7))
    expect(brushDabRandom(brushStrokeSeed('stroke-abc'), 7)).toBe(brushDabRandom(seed, 7))
  })

  it('stays in [0, 1)', () => {
    const seed = brushStrokeSeed('stroke-abc')
    for (let i = 0; i < 500; i++) {
      const v = brushDabRandom(seed, i)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('decorrelates neighbouring dabs and neighbouring strokes', () => {
    // Scatter that marched in step with the dab index would read as a pattern
    // rather than as a brush, and two strokes drawn the same way must not get
    // the identical jitter.
    const seed = brushStrokeSeed('stroke-abc')
    const run = Array.from({ length: 64 }, (_, i) => brushDabRandom(seed, i))
    expect(new Set(run).size).toBeGreaterThan(60)
    const other = brushStrokeSeed('stroke-abd')
    expect(brushDabRandom(other, 3)).not.toBe(brushDabRandom(seed, 3))
  })

  it('spreads roughly evenly, so scatter will not favour one side', () => {
    const seed = brushStrokeSeed('stroke-xyz')
    let sum = 0
    const n = 4000
    for (let i = 0; i < n; i++) sum += brushDabRandom(seed, i)
    expect(sum / n).toBeGreaterThan(0.45)
    expect(sum / n).toBeLessThan(0.55)
  })
})
