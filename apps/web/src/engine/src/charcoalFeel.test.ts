import { describe, expect, it } from 'vitest'

import { CHARCOAL_DAB_SHAPING, tiltOrPathAngle } from './dabShaping'
import { tiltMagnitudeDeg } from './tiltMath'
import {
  CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS,
  charcoalAspect, charcoalBroadDensity, charcoalBroadness, charcoalPressureResponse,
  charcoalTiltT, charcoalWidthFactor,
} from './charcoalFeel'

// #305 / ADR 005 "Форма от наклона", reshaped from a plateau ladder into a
// smooth curve in #403. The parameter *values* are explicitly uncalibrated and
// live behind dev sliders, so nothing here pins a specific degree count. What
// these protect is the response's shape — the properties a retune (or a slider
// dragged to an odd place) must not break.

const cfg = CHARCOAL_FEEL

describe('charcoal tilt response (#305, #403)', () => {
  it('stays round when the stick is stood on its end', () => {
    expect(charcoalAspect(0)).toBeCloseTo(1)
    expect(charcoalWidthFactor(0)).toBeCloseTo(1)
  })

  it('reaches its full response at a tilt a stylus can actually make', () => {
    expect(charcoalAspect(cfg.fullDeg)).toBeCloseTo(cfg.aspectMax, 3)
    expect(charcoalWidthFactor(cfg.fullDeg)).toBeCloseTo(cfg.widthMax, 3)
    // The reason #305 replaced #304's original curve, and the reason this one
    // is normalized against fullDeg rather than 90: that curve only maxed out
    // at 90°, which no hand can do with a stylus on a tablet.
    expect(cfg.fullDeg).toBeLessThan(75)
  })

  it('saturates past full tilt instead of running away', () => {
    for (const deg of [cfg.fullDeg, cfg.fullDeg + 15, 90]) {
      expect(charcoalAspect(deg)).toBeCloseTo(cfg.aspectMax, 3)
      expect(charcoalWidthFactor(deg)).toBeCloseTo(cfg.widthMax, 3)
    }
  })

  it('never decreases as tilt grows', () => {
    // Monotonicity is what removes the need for hysteresis: with no local
    // reversals there is no threshold for noise to oscillate across in a way a
    // smooth filter can't absorb.
    let prev = -Infinity
    for (let deg = 0; deg <= 90; deg += 0.5) {
      const a = charcoalAspect(deg)
      expect(a).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = a
    }
  })

  it('is continuous — no step big enough to read as a shape flip', () => {
    let prev = charcoalAspect(0)
    for (let deg = 0.5; deg <= 90; deg += 0.5) {
      const a = charcoalAspect(deg)
      expect(Math.abs(a - prev)).toBeLessThan(cfg.aspectMax / 8)
      prev = a
    }
  })

  it('has no plateau — every extra degree of lean changes the shape', () => {
    // This is the #403 change itself, and the property the ladder deliberately
    // did not have. Inside a flat region the tool stops answering the stylus,
    // and a hand cannot tell that from having stopped moving.
    for (let deg = 1; deg < cfg.fullDeg; deg += 1) {
      expect(charcoalAspect(deg)).toBeGreaterThan(charcoalAspect(deg - 1))
      expect(charcoalWidthFactor(deg)).toBeLessThan(charcoalWidthFactor(deg - 1))
    }
  })

  it('narrows the short axis as the stick goes over', () => {
    // Laid over, a cylinder contacts along a line — the mark's width comes from
    // sweeping the long axis, not from the short one growing.
    expect(cfg.widthMax).toBeLessThan(1)
    expect(charcoalWidthFactor(cfg.fullDeg)).toBeLessThan(1)
    expect(charcoalWidthFactor(cfg.fullDeg / 2)).toBeLessThan(1)
  })

  it('maps a baked aspect back to the same broadness the shader derives', () => {
    expect(charcoalBroadness(1)).toBeCloseTo(0)
    expect(charcoalBroadness(cfg.aspectMax)).toBeCloseTo(1)
    // Clamped, so a dab recorded while a slider sat higher can't overshoot.
    expect(charcoalBroadness(cfg.aspectMax * 3)).toBeCloseTo(1)
    expect(charcoalBroadness(0.2)).toBeCloseTo(0)
  })

  it('broadness is the exact inverse of the aspect curve, which is what keeps deposit and geometry in step', () => {
    for (const deg of [0, 9, 21, 38, 50, cfg.fullDeg, 88]) {
      expect(charcoalBroadness(charcoalAspect(deg))).toBeCloseTo(charcoalTiltT(deg), 9)
    }
  })

  it('deposits lighter the further onto the broad side it goes', () => {
    expect(charcoalBroadDensity(0)).toBeCloseTo(1)
    expect(charcoalBroadDensity(1)).toBeLessThan(1)
    expect(charcoalBroadDensity(1)).toBeGreaterThan(0)
    expect(charcoalBroadDensity(1)).toBeLessThan(charcoalBroadDensity(0.5))
  })

  it('degenerates safely when sliders are dragged into a collapsed range', () => {
    // A slider at an extreme must produce a hard step rather than a
    // divide-by-zero or a NaN reaching the geometry.
    const collapsed = { ...cfg, fullDeg: 0 }
    for (const deg of [0, 39.9, 40, 90]) {
      const a = charcoalAspect(deg, collapsed)
      expect(Number.isFinite(a)).toBe(true)
      expect(a).toBeGreaterThanOrEqual(1)
    }
    expect(charcoalBroadness(5, { ...cfg, aspectMax: 1 })).toBe(0)
    expect(Number.isFinite(charcoalAspect(30, { ...cfg, curve: 0 }))).toBe(true)
  })

  it('exposes every tunable field as a slider, with the default inside its range', () => {
    // A field that exists but has no slider is a knob nobody can reach on the
    // tablet, which defeats the point of tuning this by hand.
    const keys = Object.keys(cfg).sort()
    expect(CHARCOAL_FEEL_SLIDERS.map(s => s.key).sort()).toEqual(keys)
    for (const s of CHARCOAL_FEEL_SLIDERS) {
      expect(cfg[s.key]).toBeGreaterThanOrEqual(s.min)
      expect(cfg[s.key]).toBeLessThanOrEqual(s.max)
    }
  })

  // Ilya, from drawing with it: "уголь легче ложится". A friable stick marks
  // from little more than contact, so a linear-in-pressure deposit (right for
  // a hard lead being pushed into the sheet) reads as almost nothing at a
  // light touch.
  describe('pressure response', () => {
    it('lifts a light touch well above graphite\'s linear response', () => {
      for (const p of [0.1, 0.25, 0.5]) {
        expect(charcoalPressureResponse(p)).toBeGreaterThan(p)
      }
      // A quarter-pressure touch should land somewhere around half deposit,
      // not a quarter — the whole point of the change.
      expect(charcoalPressureResponse(0.25)).toBeGreaterThan(0.4)
    })

    it('still reaches exactly full deposit at full pressure', () => {
      // Lifting the low end must not flatten the curve into "always dark":
      // press-harder-is-darker has to survive.
      expect(charcoalPressureResponse(1)).toBeCloseTo(1)
      expect(charcoalPressureResponse(0)).toBeCloseTo(CHARCOAL_FEEL.pressureFloor)
      expect(charcoalPressureResponse(0.3)).toBeLessThan(charcoalPressureResponse(0.9))
    })

    it('is monotonic and bounded across the range', () => {
      let prev = -Infinity
      for (let p = 0; p <= 1.0001; p += 0.02) {
        const v = charcoalPressureResponse(p)
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
        prev = v
      }
    })

    it('collapses to the plain linear response when the knobs are neutralised', () => {
      // floor 0 + gamma 1 must reproduce graphite's own behaviour exactly —
      // the escape hatch if the lift ever turns out to be too much.
      const neutral = { ...CHARCOAL_FEEL, pressureFloor: 0, pressureGamma: 1 }
      for (const p of [0, 0.3, 0.7, 1]) {
        expect(charcoalPressureResponse(p, neutral)).toBeCloseTo(p)
      }
    })
  })

  // #404 (Ilya): the mark runs *along* the pen's lean, the same way every other
  // tool's does. #305 had charcoal alone run across it — see charcoalFeel.ts's
  // header for why that was the better physics and still lost.
  describe('elongation runs along the tilt, like every other tool', () => {
    const cases = [
      { tiltX: 50, tiltY: 0 },
      { tiltX: 0, tiltY: 50 },
      { tiltX: 35, tiltY: -35 },
    ]

    it.each(cases)('matches the shared tilt-or-path angle exactly ($tiltX, $tiltY)', ({ tiltX, tiltY }) => {
      const tiltMag = tiltMagnitudeDeg(tiltX, tiltY)
      const shared = tiltOrPathAngle(tiltMag, tiltX, tiltY, 0)
      const charcoal = CHARCOAL_DAB_SHAPING.angle(tiltMag, tiltX, tiltY, 0)
      // Compared as a direction, not a raw number: an axis is the same axis
      // whether it reads as +90° or -90°.
      expect(Math.abs(Math.sin(charcoal - shared))).toBeCloseTo(0)
    })

    it('keeps the same orientation at every lean, so nothing flips', () => {
      const mild = cfg.fullDeg / 2
      const full = cfg.fullDeg
      const a = CHARCOAL_DAB_SHAPING.angle(mild, mild, 0, 0)
      const b = CHARCOAL_DAB_SHAPING.angle(full, full, 0, 0)
      // Same tilt direction (+x) at both ends of the response must give the
      // same dab axis — a 90° difference here is exactly the flip this avoids.
      expect(Math.abs(Math.sin(b - a))).toBeCloseTo(0)
    })
  })

  // Bug found by Ilya: charcoal could not cover a sheet solid the way graphite
  // can — measured at 0.61% of a heavily scrubbed patch still pure paper after
  // 45 full-pressure passes, against graphite's 0.00%. Cause: the dropout gate
  // and the (then additive) grain term were both fixed functions of world
  // position that could drive deposit to exactly 0, so those pixels were holes
  // no repetition could ever fill.
  //
  // The real fix lives in DAB_FRAG, which MockGL never executes, so these
  // guard the *config-level* invariants the fix depends on. The behavioural
  // check is the browser coverage measurement (scratchpad/coverage.mjs),
  // re-run after the fix at 0.00% for both tools.
  describe('whole-sheet coverage invariants', () => {
    it('never lets a dropout deposit exactly nothing', () => {
      expect(CHARCOAL_FEEL.skipFloor).toBeGreaterThan(0)
    })

    it('cannot be dragged to zero from the tuning slider either', () => {
      // A slider whose min is 0 would let a tuning session silently reintroduce
      // the exact bug this invariant exists to prevent.
      const skip = CHARCOAL_FEEL_SLIDERS.find(s => s.key === 'skipFloor')
      expect(skip).toBeDefined()
      expect(skip!.min).toBeGreaterThan(0)
    })

    it('lets pressure — not the floor — do the covering', () => {
      // gateRelief is what closes the gaps under a firm hand while leaving a
      // light pass fully broken up. If it were 0, solid coverage would have to
      // come from raising skipFloor, which mutes the texture at every pressure
      // (tried, and it visibly flattened the broad-side stroke).
      expect(CHARCOAL_FEEL.gateRelief).toBeGreaterThan(0)
      expect(CHARCOAL_FEEL.gateRelief).toBeLessThanOrEqual(1)
      // The floor stays low enough that a single light pass still reads broken.
      expect(CHARCOAL_FEEL.skipFloor).toBeLessThan(0.3)
    })
  })

  it('stays within 0..1 across the whole tilt range, including nonsense input', () => {
    for (let deg = -10; deg <= 120; deg += 3) {
      const t = charcoalTiltT(deg)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(1)
    }
  })
})
