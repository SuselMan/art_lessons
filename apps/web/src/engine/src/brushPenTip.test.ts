import { describe, expect, it } from 'vitest'

import { brushPenWidth, PRESSURE_RESPONSES, shapingForBrushPenPreset } from './brushPenPresets'
import { createTipState, tipFootprint } from './tipFootprint'
import { DabSystem } from './DabSystem'
import { shapingForTool } from './dabShaping'

// #472, ADR 009 §13 — the flexible nib: a contact patch that is elongated by
// pressure and trails the direction of travel, instead of v1's circle of
// varying diameter swept along the spline.
//
// These are real tests of the shipped behaviour rather than of a mock: the
// bend is CPU-side dab geometry (Dab.aspectRatio / Dab.angle), computed in
// DabSystem and baked into the recorded operation. What MockGL cannot test is
// the *ribbon rasterizer* that consumes them (see docs/adr/009 §1) — so what a
// bent nib looks like is still verified in a browser, and what a bent nib *is*
// is verified here.

interface Sample { x: number; y: number; p?: number }

const BASE_SIZE = 20

/** Drives a whole stroke through the real public API and returns every dab.
 *  `speed` is canvas px/ms, and defaults to 0 — i.e. every test that isn't
 *  about the speed-driven trail sees no displacement at all. */
function brushPenStroke(points: Sample[], baseSize = BASE_SIZE, response = 'normal', speed = 0): ReturnType<DabSystem['startStroke']> {
  const sys = new DabSystem()
  sys.setShaping(shapingForTool('brushPen', response))
  const first = points[0]
  const dabs = [...sys.startStroke(first.x, first.y, first.p ?? 0.9, 0, 0, baseSize, speed)]
  for (let i = 1; i < points.length; i++) {
    const s = points[i]
    dabs.push(...sys.continueStroke(s.x, s.y, s.p ?? 0.9, 0, 0, baseSize, speed))
  }
  dabs.push(...sys.endStroke(baseSize, speed))
  return dabs
}

/** Smallest angle between two directions, in [0, PI]. */
function angleDelta(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
}

function horizontal(count: number, step: number, pressure = 0.9): Sample[] {
  return Array.from({ length: count }, (_, i) => ({ x: i * step, y: 0, p: pressure }))
}

/** `count` samples along a quarter circle of the given radius, starting at
 *  (0, -radius) heading +x and ending heading +y. */
function quarterArc(count: number, radius: number): Sample[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / (count - 1)) * (Math.PI / 2)
    return { x: radius * Math.sin(a), y: radius * (1 - Math.cos(a)) - radius }
  })
}

/** Cumulative arc length from the stroke's first dab to each dab. */
function arcLengths(dabs: Array<{ x: number; y: number }>): number[] {
  const out = [0]
  for (let i = 1; i < dabs.length; i++) {
    out.push(out[i - 1] + Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y))
  }
  return out
}

describe('brush pen: the nib is not a circle (#472)', () => {
  it('elongates the contact patch under pressure, along the direction of travel', () => {
    const dabs = brushPenStroke(horizontal(10, 20, 0.9))
    // Late in the stroke, i.e. once the nib has actually been dragged — the
    // bend builds up over distance, it is not a property of the pressure
    // alone. See the ramp tests below.
    const settled = dabs.slice(-6)
    expect(settled.length).toBe(6)
    for (const d of settled) {
      expect(d.aspectRatio).toBeGreaterThan(1.5)
      // Travelling along +x, and by here the nib has long since caught up.
      expect(angleDelta(d.angle, 0)).toBeLessThan(0.05)
    }
  })

  it('leaves width to pressure alone: the long axis lies along travel, not across it', () => {
    const light = brushPenStroke(horizontal(8, 12, 0.15)).slice(2)
    const heavy = brushPenStroke(horizontal(8, 12, 0.9)).slice(2)
    // The short axis (Dab.size, which is what the ribbon sweeps as width) has
    // to track pressure by roughly the pressure curve's own ratio. If
    // elongation had leaked into width this would come out inflated.
    const ratio = heavy[0].size / light[0].size
    const expected = brushPenWidth(0.9, 'normal') / brushPenWidth(0.15, 'normal')
    expect(ratio).toBeCloseTo(expected, 5)
  })

  it('is round at touchdown — a nib that has not been dragged yet is not bent', () => {
    const sys = new DabSystem()
    sys.setShaping(shapingForTool('brushPen', 'normal'))
    const [head] = sys.startStroke(0, 0, 1.0, 0, 0, BASE_SIZE)
    // Full pressure, i.e. the most elongation this tool has — and still round,
    // because the first dab has no direction of travel to be bent along. The
    // alternative (seeding from startStroke's placeholder path angle) would
    // stamp every stroke's head as an ellipse pointing along +x.
    expect(head.aspectRatio).toBeCloseTo(1, 6)
  })

  // Reported by Ilya on the first build of #472, stylus on a tablet: "делаю
  // сильное давление, получаю эллипс — далее чуууть-чуть сдвигаю кисть и
  // эллипс поворачивается на месте радикально".
  //
  // The model bent the nib fully on the first dab that had any direction at
  // all, so a press-and-nudge stamped a full ellipse and then spun it on the
  // spot — the nudge's direction being noise, the pen having moved about a
  // pixel. Both halves of that are wrong about the same thing: the bend is a
  // consequence of *dragging*, not of pressing.
  it('does not bend on a nudge, however hard the pen is pressed', () => {
    // Full pressure on a 40px pen, moved a third of the nib's own width in
    // total — far enough to emit real spline dabs (spacing is 8.8px there),
    // nowhere near far enough to count as dragging the nib.
    const nudge = brushPenStroke([
      { x: 0, y: 0, p: 1 }, { x: 4, y: 0, p: 1 }, { x: 8, y: 0.6, p: 1 }, { x: 13, y: -0.4, p: 1 },
    ], 40)
    expect(nudge.length).toBeGreaterThan(1)
    for (const d of nudge) expect(d.aspectRatio).toBeLessThan(1.2)
  })

  it('does not swing the footprint around while it is barely bent', () => {
    // The same nudge, then a nudge back the other way. Under the first model
    // the ellipse pointed +x and then flipped to -x, i.e. rotated by half a
    // turn on the spot. What has to hold is not that the angle is stable —
    // a round nib's angle is meaningless — but that nothing *visible* turns,
    // so the assertion is on the footprint, not on the number.
    const wobble = brushPenStroke([
      { x: 0, y: 0, p: 1 }, { x: 9, y: 0, p: 1 }, { x: 2, y: 1, p: 1 },
      { x: 10, y: 0.5, p: 1 }, { x: 3, y: 1.5, p: 1 },
    ], 40)
    // 1.22 measured; the bound is the "still reads as a round nib" range
    // rather than a tight fit, because the constants are uncalibrated.
    for (const d of wobble) expect(d.aspectRatio).toBeLessThan(1.25)
  })

  it('builds the bend up over dragging distance, and gives it all back on a reversal', () => {
    const PEN = 40
    const straight = brushPenStroke(horizontal(12, 30, 1.0), PEN)
    // Compared as *bend*, i.e. aspect - 1: aspect itself is 1 + bend, so a
    // ratio of aspects understates a difference that is really 0.12 against
    // 0.85.
    const early = straight[1].aspectRatio - 1
    const late = straight[straight.length - 3].aspectRatio - 1
    expect(early).toBeLessThan(late * 0.3)  // still bending
    expect(late).toBeGreaterThan(0.5)       // and it does get there

    // Dragged out and dragged straight back over itself: at the turn the
    // fibres straighten out, so the mark passes back through round.
    const back = brushPenStroke([
      ...horizontal(8, 30, 1.0),
      ...[6, 5, 4, 3, 2, 1, 0].map(i => ({ x: i * 30, y: 0, p: 1.0 })),
    ], PEN)
    expect(Math.min(...back.map(d => d.aspectRatio))).toBeLessThan(1.15)
  })

  it('elongation grows with pressure and saturates with the same curve as width', () => {
    for (const response of PRESSURE_RESPONSES) {
      const bend = shapingForTool('brushPen', response).tipBend
      expect(bend).toBeDefined()
      const values = [0, 0.25, 0.5, 0.75, 1].map(p => bend!.elongation(p))
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1])
      expect(values[0]).toBeLessThan(1.1)   // a light touch is a near-round point
      expect(values[4]).toBeGreaterThan(1.6) // a pressed nib is visibly a stroke, not a dot
    }
  })
})

describe('brush pen: the nib trails the hand (#472)', () => {
  it('lags the tangent through a turn, then catches up once the hand goes straight', () => {
    // A quarter arc ending along +y, then a straight run along +y — the turn
    // has to *end* somewhere for "catches up" to mean anything, and the arc
    // alone ends at the moment the nib is furthest behind.
    const arc = quarterArc(9, 60)
    const end = arc[arc.length - 1]
    const dabs = brushPenStroke([...arc, ...[1, 2, 3, 4, 5, 6].map(i => ({ x: end.x, y: end.y + i * 25 }))], BASE_SIZE)

    const lagToFinalHeading = dabs.map(d => angleDelta(d.angle, Math.PI / 2))
    const arcEndIdx = dabs.findIndex(d => d.y > end.y)
    // Coming out of the turn the nib is still pointing at where the hand was...
    expect(lagToFinalHeading[arcEndIdx]).toBeGreaterThan(0.2)
    // ...and on the straight it converges rather than oscillating or sticking.
    expect(lagToFinalHeading[lagToFinalHeading.length - 1]).toBeLessThan(0.05)
    // Monotone convergence over the straight run — no overshoot past the
    // heading and back, which a filtered *angle* could do and a filtered
    // vector cannot.
    const straightLags = lagToFinalHeading.slice(arcEndIdx)
    for (let i = 1; i < straightLags.length; i++) {
      expect(straightLags[i]).toBeLessThanOrEqual(straightLags[i - 1] + 1e-9)
    }
  })

  it('lags by distance, not by dab count — the same curve sampled twice as densely bends the same', () => {
    // The point of expressing the lag as `1 - exp(-ds / lagPx)`. Under a
    // per-dab weight this test fails by construction: doubling the input
    // report rate doubles the number of filter steps over the same line, so
    // the nib would catch up twice as fast on a faster tablet — i.e. the
    // tool's plasticity would be a property of the hardware.
    const sparse = brushPenStroke(quarterArc(7, 60))
    const dense = brushPenStroke(quarterArc(13, 60))
    const sparseArc = arcLengths(sparse)
    const denseArc = arcLengths(dense)

    const nearest = (arc: number[], target: number): number =>
      arc.reduce((best, len, i) => (Math.abs(len - target) < Math.abs(arc[best] - target) ? i : best), 0)

    // Sampled across the second half of the arc, where the turn has had time
    // to bend the nib and the two samplings have diverged as far as they will.
    const total = Math.min(sparseArc[sparseArc.length - 1], denseArc[denseArc.length - 1])
    for (const frac of [0.5, 0.65, 0.8, 0.95]) {
      const target = total * frac
      const a = sparse[nearest(sparseArc, target)]
      const b = dense[nearest(denseArc, target)]
      expect(angleDelta(a.angle, b.angle)).toBeLessThan(0.12)
    }
  })

  it('does not bend any other tool', () => {
    // The bend is opt-in per profile, like tilt and pressure smoothing before
    // it. Graphite through the identical path must come out with the angle its
    // own pure shape function gives — the path tangent, here 0 — and with no
    // elongation at all.
    const sys = new DabSystem()
    sys.setShaping(shapingForTool('pencil'))
    sys.startStroke(0, 0, 0.9, 0, 0, BASE_SIZE)
    const dabs = []
    for (const s of horizontal(8, 12).slice(1)) dabs.push(...sys.continueStroke(s.x, s.y, 0.9, 0, 0, BASE_SIZE))
    expect(dabs.length).toBeGreaterThan(4)
    const pencil = shapingForTool('pencil')
    for (const d of dabs) {
      expect(d.aspectRatio).toBeCloseTo(pencil.aspect(0), 6)
      expect(angleDelta(d.angle, 0)).toBeLessThan(0.05)
    }
  })
})

describe('brush pen: pressure smoothing runs on distance, not on samples (#472)', () => {
  // Same drawn line, same pressure at every *position*, two report rates.
  //
  // The gesture is a smooth 40px-wide swell rather than an instant step, and
  // that is a statement about what is being claimed, not a way to make the
  // test easier. A one-pole weighted by distance is the exact discretization
  // of dy/dx = (u - y)/L, so it is rate-invariant for any input the sampling
  // itself resolves — but a discontinuity is by definition not resolved, and
  // there the sparser sampling necessarily sees the jump up to one interval
  // early. A real hand does not step its pressure inside 5px; it is the swell
  // that has to survive the change of tablet.
  const STEP_AT = 100
  const SWELL_PX = 40

  const PEN_PX = 8
  const V1_PER_SAMPLE_K = 0.35 // BRUSH_PEN_PRESSURE_SMOOTHING as v1 shipped it

  function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v))
  }

  /** The gesture: one smooth swell in pressure, defined against *position*. */
  function gesture(sampleCount: number): Sample[] {
    const LENGTH = 200
    return Array.from({ length: sampleCount }, (_, i) => {
      const x = (i / (sampleCount - 1)) * LENGTH
      const u = clamp01((x - (STEP_AT - SWELL_PX / 2)) / SWELL_PX)
      return { x, y: 0, p: 0.2 + 0.7 * (u * u * (3 - 2 * u)) }
    })
  }

  function widthsAlong(sampleCount: number, emulateV1: boolean): Array<{ arc: number; size: number }> {
    let points = gesture(sampleCount)
    const shaping = { ...shapingForTool('brushPen', 'normal') }
    if (emulateV1) {
      // v1: a fixed weight spent once per admitted sample, so the same gesture
      // is smoothed as many times as the tablet chose to report it.
      delete shaping.pressureSmoothingPx
      let filtered: number | null = null
      points = points.map(s => {
        filtered = filtered === null ? s.p! : filtered + (s.p! - filtered) * V1_PER_SAMPLE_K
        return { ...s, p: filtered }
      })
    }
    const sys = new DabSystem()
    sys.setShaping(shaping)
    const dabs = [...sys.startStroke(points[0].x, points[0].y, points[0].p!, 0, 0, PEN_PX)]
    for (const s of points.slice(1)) dabs.push(...sys.continueStroke(s.x, s.y, s.p!, 0, 0, PEN_PX))
    dabs.push(...sys.endStroke(PEN_PX))
    const arcs = arcLengths(dabs)
    return dabs.map((d, i) => ({ arc: arcs[i], size: d.size }))
  }

  /** Largest width disagreement between a 20px-per-sample and a 5px-per-sample
   *  recording of the same gesture, measured at matched distances along it. */
  function rateSpread(emulateV1: boolean): number {
    const slow = widthsAlong(11, emulateV1)
    const fast = widthsAlong(41, emulateV1)
    const at = (series: Array<{ arc: number; size: number }>, target: number): number =>
      series.reduce((best, s) => (Math.abs(s.arc - target) < Math.abs(best.arc - target) ? s : best)).size
    return Math.max(...[90, 100, 110, 120, 140].map(t => Math.abs(at(fast, t) - at(slow, t))))
  }

  it('holds the same width at the same distance far better than the per-sample filter did', () => {
    // Not "identical": with 20px between samples the sparser recording cannot
    // resolve a 40px swell as well as the denser one, and no filter fixes an
    // input it never saw. What the length-based weight fixes is the *filter's*
    // own contribution, which under v1 was the larger error of the two.
    //
    // Measured at the shipped constants: worst disagreement 0.79px of an 8px
    // pen (9.9%) against v1's 2.06px (26%). Both bounds below are stated with
    // margin over that, since every constant in brushPenPresets.ts is declared
    // uncalibrated and expected to be retuned.
    const shipped = rateSpread(false)
    const v1 = rateSpread(true)
    expect(shipped).toBeLessThan(v1 * 0.5)
    expect(shipped).toBeLessThan(PEN_PX * 0.12)
  })
})

describe('brush pen: speed thins the contact slightly (#472, moved into the model by #482)', () => {
  const shaping = shapingForBrushPenPreset('normal')
  const NIB = 10

  /** Runs `n` dabs of travel at a constant speed and returns each dab's width.
   *  #482: this used to be a post-pass over an array of already-made dabs; it
   *  is a declared profile field now, applied inside tipFootprint *before* the
   *  nib's lag and trail are derived from that width. */
  /** A tip already past its own head taper, so these tests measure the speed
   *  factor and nothing else — both now live in the same function, and the
   *  taper's 0.35 -> 1.0 ramp would otherwise swamp a 10% speed effect. */
  const pastHead = () => Object.assign(createTipState(), { arcFromStart: 100 })

  function widths(n: number, speed: number, dsPx: number, state = pastHead()): number[] {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      out.push(tipFootprint(shaping, {
        x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, baseSize: NIB,
        pathAngle: 0, ds: dsPx, speed, cameraAngle: 0,
      }, state).size)
    }
    return out
  }

  it('leaves a slow stroke alone and thins a fast one', () => {
    // brushPenWidth(1, 'normal') x NIB is the untapered, unthinned width.
    const full = brushPenWidth(1, 'normal') * NIB
    const slow = widths(20, 0.2, 3)
    for (const w of slow) expect(w / full).toBeCloseTo(1, 6)

    const fast = widths(40, 3.0, 3)
    const settled = fast[fast.length - 1] / full
    expect(settled).toBeLessThan(0.95)
    expect(settled).toBeGreaterThan(0.85) // never anywhere near competing with pressure
  })

  it('eases into the new factor instead of stepping', () => {
    // Speed is measured per pointer event and a batch is often one dab, so the
    // raw value steps between batches. Against a ribbon that interpolates width
    // continuously between consecutive dabs, an unsmoothed step is a notch in
    // the silhouette.
    const w = widths(6, 3.0, 3)
    for (let i = 1; i < w.length; i++) expect(w[i - 1] - w[i]).toBeLessThan(0.4)
    expect(w[w.length - 1]).toBeLessThan(w[0])
  })

  it('carries across batches, because the easing lives in the stroke state', () => {
    // The old post-pass had to be handed its own previous return value by
    // PencilEngine to survive a pointer-event boundary. Nothing has to remember
    // to do that now: batches are not a concept the tip model has.
    const state = pastHead()
    const first = widths(3, 3.0, 3, state)
    const second = widths(3, 3.0, 3, state)
    expect(second[0]).toBeLessThan(first[first.length - 1])
  })

  it('eases over a distance, so a big brush does not settle four times slower', () => {
    // It shipped as a per-dab weight, and dab spacing is proportional to brush
    // size — so the same gesture settled over four times the distance on a
    // 160 px brush as on a 40 px one. Same travel now means the same easing.
    const dense  = widths(40, 3.0, 1)
    const sparse = widths(10, 3.0, 4)   // same 40 px of travel, a quarter of the dabs
    // Exactly equal, not merely close: composing `1 - exp(-d/L)` over n steps
    // of d leaves residual exp(-nd/L), which depends on the total distance and
    // not on how it was cut up. That identity is the whole reason for the move.
    expect(dense[dense.length - 1]).toBeCloseTo(sparse[sparse.length - 1], 9)
  })
})

describe('brush pen: the mark trails the pen (#472, MyPaint offset_by_speed)', () => {
  const PEN = 40
  const path = horizontal(14, 40, 0.9)

  /** Same stroke, same geometry, one drawn slowly and one fast. */
  const still = () => brushPenStroke(path, PEN, 'normal', 0.2)
  const fast = () => brushPenStroke(path, PEN, 'normal', 3.0)

  it('lands the mark under the pen at drawing speed and behind it at speed', () => {
    const slowX = still().map(d => d.x)
    const fastX = fast().map(d => d.x)
    expect(fastX.length).toBe(slowX.length)
    // Nothing at all at the head, where the nib has not bent yet...
    expect(fastX[0]).toBeCloseTo(slowX[0], 6)
    // ...and a real displacement once it has, always backwards along travel.
    const settled = fastX.length - 3
    expect(slowX[settled] - fastX[settled]).toBeGreaterThan(1)
    for (let i = 0; i < slowX.length; i++) expect(fastX[i]).toBeLessThanOrEqual(slowX[i] + 1e-9)
  })

  it('stays inside the nib, not out at arm\'s length', () => {
    const slowX = still().map(d => d.x)
    const fastX = fast().map(d => d.x)
    const worst = Math.max(...slowX.map((x, i) => x - fastX[i]))
    // A displacement of the order of the nib's own width reads as weight; one
    // of the order of the stroke reads as broken input.
    expect(worst).toBeLessThan(PEN * 0.25)
  })

  it('never hands the ribbon two dabs in reverse order along the path', () => {
    // The geometric safety property, and the reason the trail is eased in over
    // the same distance as the bend: it is subtracted from dab positions, so a
    // trail that deepened faster than the dabs advance would run the path
    // backwards and the ribbon would build a band inside out.
    for (const speed of [0.5, 1.5, 3.0, 12.0]) {
      const xs = brushPenStroke(path, PEN, 'normal', speed).map(d => d.x)
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
    }
  })

  it('does not displace an unbent nib, however fast the pointer claims to be', () => {
    // Press, nudge, at absurd speed: no bend, so nothing to trail. This is
    // what keeps careful slow work — and the first moment of every stroke —
    // free of anything that could read as input lag.
    const nudge = brushPenStroke([
      { x: 0, y: 0, p: 1 }, { x: 4, y: 0, p: 1 }, { x: 8, y: 0.6, p: 1 }, { x: 13, y: -0.4, p: 1 },
    ], PEN, 'normal', 12.0)
    const same = brushPenStroke([
      { x: 0, y: 0, p: 1 }, { x: 4, y: 0, p: 1 }, { x: 8, y: 0.6, p: 1 }, { x: 13, y: -0.4, p: 1 },
    ], PEN, 'normal', 0)
    for (let i = 0; i < nudge.length; i++) {
      expect(Math.hypot(nudge[i].x - same[i].x, nudge[i].y - same[i].y)).toBeLessThan(1)
    }
  })
})

describe('brush pen: width floor (#472)', () => {
  it('bottoms out at 10% of nominal size, not 15%', () => {
    for (const response of PRESSURE_RESPONSES) {
      expect(brushPenWidth(0, response)).toBeCloseTo(0.10, 6)
      expect(brushPenWidth(1, response)).toBeCloseTo(1.0, 6)
    }
  })
})
