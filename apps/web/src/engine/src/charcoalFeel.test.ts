import { describe, expect, it } from 'vitest'

import { CHARCOAL_DAB_SHAPING, tiltOrPathAngle } from './dabShaping'
import {
  CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS,
  charcoalAspect, charcoalBroadDensity, charcoalBroadness, charcoalPressureResponse,
  charcoalTiltWeights, charcoalWidthFactor,
} from './charcoalFeel'

// #305 / ADR 005 "Форма от наклона". The threshold *values* are explicitly
// uncalibrated and live behind dev sliders, so nothing here pins a specific
// degree count. What these protect is the ladder's shape — the properties a
// retune (or a slider dragged to an odd place) must not break.

const cfg = CHARCOAL_FEEL

describe('charcoal tilt ladder (#305)', () => {
  it('stays perfectly round below the first threshold', () => {
    for (const deg of [0, 5, 10, cfg.roundMaxDeg]) {
      expect(charcoalAspect(deg)).toBeCloseTo(1)
      expect(charcoalWidthFactor(deg)).toBeCloseTo(1)
    }
  })

  it('reaches the edge plateau and holds it across an ordinary writing grip', () => {
    // The plateau must actually be flat, not a slope that happens to pass
    // through the right values — that flatness is what makes the regime read as
    // a distinct state to the hand instead of a continuously morphing shape.
    const atEdge = charcoalAspect(cfg.edgeFullDeg)
    expect(atEdge).toBeCloseTo(cfg.edgeAspect, 3)
    for (const deg of [cfg.edgeFullDeg, 40, 45, cfg.broadStartDeg]) {
      expect(charcoalAspect(deg)).toBeCloseTo(cfg.edgeAspect, 3)
    }
  })

  it('reaches the broad plateau at a tilt a stylus can actually make', () => {
    expect(charcoalAspect(cfg.broadFullDeg)).toBeCloseTo(cfg.broadAspect, 3)
    // The whole reason this ladder replaced #304's single curve: that one only
    // maxed out at 90°, which no hand can do with a stylus on a tablet.
    expect(cfg.broadFullDeg).toBeLessThan(75)
    // ...but not so easy that an ordinary grip lands in it by accident.
    expect(cfg.broadStartDeg).toBeGreaterThan(40)
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
    // A discrete three-mode implementation would jump here; a ladder must not.
    let prev = charcoalAspect(0)
    for (let deg = 0.5; deg <= 90; deg += 0.5) {
      const a = charcoalAspect(deg)
      expect(Math.abs(a - prev)).toBeLessThan(cfg.broadAspect / 8)
      prev = a
    }
  })

  it('narrows the short axis for both elongated regimes', () => {
    // The edge of a stick is thinner than its end face, and laid over, a
    // cylinder contacts along a line — the mark's width comes from sweeping the
    // long axis, not from the short one growing.
    expect(charcoalWidthFactor(cfg.edgeFullDeg)).toBeLessThan(1)
    expect(charcoalWidthFactor(cfg.broadFullDeg)).toBeLessThan(1)
  })

  it('maps a baked aspect back to the same broadness the shader derives', () => {
    expect(charcoalBroadness(1)).toBeCloseTo(0)
    expect(charcoalBroadness(cfg.broadAspect)).toBeCloseTo(1)
    // Clamped, so a dab recorded while a slider sat higher can't overshoot.
    expect(charcoalBroadness(cfg.broadAspect * 3)).toBeCloseTo(1)
    expect(charcoalBroadness(0.2)).toBeCloseTo(0)
  })

  it('deposits lighter the further onto the broad side it goes', () => {
    expect(charcoalBroadDensity(0)).toBeCloseTo(1)
    expect(charcoalBroadDensity(1)).toBeLessThan(1)
    expect(charcoalBroadDensity(1)).toBeGreaterThan(0)
    expect(charcoalBroadDensity(1)).toBeLessThan(charcoalBroadDensity(0.5))
  })

  it('degenerates safely when sliders are dragged into a collapsed range', () => {
    // The sliders let thresholds cross over each other; that must produce a
    // hard step rather than a divide-by-zero or a NaN reaching the geometry.
    const collapsed = { ...cfg, roundMaxDeg: 40, edgeFullDeg: 40, broadStartDeg: 40, broadFullDeg: 40 }
    for (const deg of [0, 39.9, 40, 40.1, 90]) {
      const a = charcoalAspect(deg, collapsed)
      expect(Number.isFinite(a)).toBe(true)
      expect(a).toBeGreaterThanOrEqual(1)
    }
    expect(charcoalBroadness(5, { ...cfg, broadAspect: 1 })).toBe(0)
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

  // Ilya, from drawing with it: the mark must run *across* the pen's lean, not
  // along it — that arc of the stick's rim is what you turn it onto to draw a
  // thin line. Also the property that removes the ladder's 90° flip, since the
  // broad regime now follows the same orientation.
  describe('elongation runs across the tilt', () => {
    const cases = [
      { tiltX: 50, tiltY: 0 },
      { tiltX: 0, tiltY: 50 },
      { tiltX: 35, tiltY: -35 },
    ]

    it.each(cases)('is a quarter turn off the tilt azimuth ($tiltX, $tiltY)', ({ tiltX, tiltY }) => {
      const tiltMag = Math.hypot(tiltX, tiltY)
      const along = tiltOrPathAngle(tiltMag, tiltX, tiltY, 0)
      const across = CHARCOAL_DAB_SHAPING.angle(tiltMag, tiltX, tiltY, 0)
      // Compared as a direction, not a raw number: an axis is the same axis
      // whether it reads as +90° or -90°.
      const delta = Math.abs(Math.sin(across - along))
      expect(delta).toBeCloseTo(1)
    })

    it('keeps the same orientation in both elongated regimes, so nothing flips', () => {
      const edgeDeg = cfg.edgeFullDeg
      const broadDeg = cfg.broadFullDeg
      const edge = CHARCOAL_DAB_SHAPING.angle(edgeDeg, edgeDeg, 0, 0)
      const broad = CHARCOAL_DAB_SHAPING.angle(broadDeg, broadDeg, 0, 0)
      // Same tilt direction (+x) at both ends of the ladder must give the same
      // dab axis — a 90° difference here is exactly the flip this avoids.
      expect(Math.abs(Math.sin(broad - edge))).toBeCloseTo(0)
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

  it('weights stay within 0..1 across the whole tilt range', () => {
    for (let deg = -10; deg <= 120; deg += 3) {
      const { edge, broad } = charcoalTiltWeights(deg)
      for (const w of [edge, broad]) {
        expect(w).toBeGreaterThanOrEqual(0)
        expect(w).toBeLessThanOrEqual(1)
      }
    }
  })
})
