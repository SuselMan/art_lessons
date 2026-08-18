import { describe, expect, it } from 'vitest'

import { applyBrushPenSpeedContact, brushPenWidth, PRESSURE_RESPONSES } from './brushPenPresets'
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

/** Drives a whole stroke through the real public API and returns every dab. */
function brushPenStroke(points: Sample[], baseSize = BASE_SIZE, response = 'normal'): ReturnType<DabSystem['startStroke']> {
  const sys = new DabSystem()
  sys.setShaping(shapingForTool('brushPen', response))
  const first = points[0]
  const dabs = [...sys.startStroke(first.x, first.y, first.p ?? 0.9, 0, 0, baseSize)]
  for (let i = 1; i < points.length; i++) {
    const s = points[i]
    dabs.push(...sys.continueStroke(s.x, s.y, s.p ?? 0.9, 0, 0, baseSize))
  }
  dabs.push(...sys.endStroke(baseSize))
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
    const dabs = brushPenStroke(horizontal(8, 12, 0.9))
    // The head dab is deliberately excluded — see the round-at-touchdown test.
    const mid = dabs.slice(2)
    expect(mid.length).toBeGreaterThan(4)
    for (const d of mid) {
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
  it('lags the tangent through a turn, then catches up', () => {
    // A quarter arc ending along +y: the tangent at the end is PI/2 exactly.
    const dabs = brushPenStroke(quarterArc(9, 60), BASE_SIZE)
    const tail = dabs.slice(-6)
    const lagAtCorner = angleDelta(tail[0].angle, Math.PI / 2)
    const lagAtEnd = angleDelta(tail[tail.length - 1].angle, Math.PI / 2)
    // Mid-turn the nib is still pointing at where the hand was...
    expect(lagAtCorner).toBeGreaterThan(0.15)
    // ...and it converges rather than oscillating or sticking.
    expect(lagAtEnd).toBeLessThan(lagAtCorner * 0.5)
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

describe('brush pen: speed thins the contact slightly (#472)', () => {
  const dabsOfSize = (n: number, size: number) =>
    Array.from({ length: n }, () => ({ x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, size, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }))

  it('leaves a slow stroke alone and thins a fast one', () => {
    const slow = dabsOfSize(20, 10)
    applyBrushPenSpeedContact(slow, 0.2, 1)
    for (const d of slow) expect(d.size).toBeCloseTo(10, 6)

    const fast = dabsOfSize(40, 10)
    const factor = applyBrushPenSpeedContact(fast, 3.0, 1)
    expect(factor).toBeLessThan(0.95)
    expect(factor).toBeGreaterThan(0.85) // and never anywhere near competing with pressure
  })

  it('eases into the new factor instead of stepping', () => {
    // Speed is measured per pointer event and a batch is often one dab, so the
    // raw value steps between batches. Against a ribbon that interpolates
    // width continuously between consecutive dabs, an unsmoothed step is a
    // notch in the silhouette.
    const dabs = dabsOfSize(6, 10)
    applyBrushPenSpeedContact(dabs, 3.0, 1)
    const steps = dabs.map((d, i) => (i === 0 ? 10 - d.size : dabs[i - 1].size - d.size))
    for (const s of steps) expect(s).toBeLessThan(0.4)
    expect(dabs[dabs.length - 1].size).toBeLessThan(dabs[0].size)
  })

  it('carries the factor across batches so a stroke does not re-ease at every event', () => {
    const first = dabsOfSize(3, 10)
    const carried = applyBrushPenSpeedContact(first, 3.0, 1)
    const second = dabsOfSize(3, 10)
    applyBrushPenSpeedContact(second, 3.0, carried)
    // The second batch continues from where the first left off, so it is
    // already thinner throughout than the first batch ever got.
    expect(second[0].size).toBeLessThan(first[first.length - 1].size)
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
