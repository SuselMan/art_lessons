import { describe, expect, it } from 'vitest'

import type { Dab } from '@grafetto/shared'

import {
  LINER_PRESET, LINER_SIZES_MM, LINER_DWELL, applyLinerEndTaper,
  linerSpeedFlow, linerTiltFlow, dwellFlow, dwellConfigForTool,
  linerWickPx, LINER_WICK_PX, LINER_WICK_RADIUS_CAP,
} from './linerPresets'

describe('LINER_SIZES_MM', () => {
  it('is the fixed, ascending MVP size ladder from ADR 003', () => {
    expect(LINER_SIZES_MM).toEqual([0.1, 0.2, 0.3, 0.5, 0.8])
  })
})

describe('LINER_PRESET', () => {
  it('has no hardness scale — one flat preset for every size (unlike PENCIL_PRESETS)', () => {
    expect(LINER_PRESET.opacity).toBeGreaterThan(0.85) // near-saturated first pass, ADR §5
    expect(LINER_PRESET.hardness).toBeGreaterThan(0.7) // crisp edge, not graphite's soft falloff
    expect(LINER_PRESET.sizeMultiplier).toBe(1)
  })
})

describe('linerSpeedFlow (#245 constant-flow-over-time, reshaped to a plateau in #532)', () => {
  // The range Ilya's own hatching actually measured at, decoded from eight
  // real strokes in a room log (#532). Every one of these is ordinary drawing,
  // and the whole point of the reshape is that ordinary drawing is flat.
  const MEASURED_HATCHING_SPEEDS = [0.24, 0.36, 0.53, 0.64, 0.9, 1.17]

  it('is exactly 1.0 across the whole range a person actually hatches at', () => {
    for (const speed of MEASURED_HATCHING_SPEEDS) {
      expect(linerSpeedFlow(speed)).toBeCloseTo(1.0)
    }
  })

  it('holds the plateau with margin above the fastest measured hatching', () => {
    // 1.17 px/ms was the top of the measured range; the plateau has to extend
    // past it or an ordinary brisk stroke falls off the edge of it.
    expect(linerSpeedFlow(1.5)).toBeCloseTo(1.0)
    expect(linerSpeedFlow(1.75)).toBeCloseTo(1.0)
  })

  it('starves only once the tip outruns the feed — the "длинный быстрый штрих" case', () => {
    expect(linerSpeedFlow(2.5)).toBeLessThan(1.0)
    expect(linerSpeedFlow(4)).toBeCloseTo(0.75)
    expect(linerSpeedFlow(100)).toBeCloseTo(0.75) // floors, no runaway toward 0
  })

  it('pools by only a few percent as a moving stroke slows to a crawl', () => {
    // #245 gave this end 1.4 — 40% more ink for moving slowly. A metered feed
    // has nothing like that spare; the stationary blot is dwellFlow's job.
    expect(linerSpeedFlow(0)).toBeCloseTo(1.05)
    expect(linerSpeedFlow(0.1)).toBeGreaterThan(1.0)
    expect(linerSpeedFlow(0.1)).toBeLessThan(1.1)
  })

  it('joins its plateau smoothly at both ends', () => {
    // A kink in tone at exactly the speed people draw at is the failure this
    // curve exists to avoid, so both joins are checked as derivatives rather
    // than just as values. Slope per 0.01 px/ms, either side of each join.
    // A linear ramp into the plateau would show ~0.33 at the slow join, so
    // this bound still has better than 6x of margin over the thing it rules
    // out; it is not tight enough to be brittle about the exact easing.
    const slope = (s: number) => (linerSpeedFlow(s + 0.005) - linerSpeedFlow(s - 0.005)) / 0.01
    for (const join of [0.15, 1.75]) {
      expect(Math.abs(slope(join))).toBeLessThan(0.05)
    }
  })

  it('is monotonically decreasing in speed', () => {
    const speeds = [0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 8]
    const flows = speeds.map(linerSpeedFlow)
    for (let i = 1; i < flows.length; i++) expect(flows[i]).toBeLessThanOrEqual(flows[i - 1])
  })
})

describe('dwellFlow / dwellConfigForTool / LINER_DWELL (#245)', () => {
  it('starts at 1.0, within a few percent of where the moving stroke left off', () => {
    expect(dwellFlow(0, LINER_DWELL)).toBeCloseTo(1.0)
    // (#532) The handoff step, which used to be 0.4 and claimed to be zero:
    // linerSpeedFlow at a standstill returned #245's ceiling of 1.4 and dwell
    // then restarted the ramp from 1.0, dropping the ink 29% at the exact
    // moment the pen stopped. Now both ends of the handoff are ~1.0.
    expect(Math.abs(linerSpeedFlow(0) - dwellFlow(0, LINER_DWELL))).toBeLessThan(0.06)
  })

  it('still lets a genuinely resting tip blot well past what a moving stroke can', () => {
    // The reason dwell keeps its own ceiling instead of aliasing the moving
    // curve's: time at one spot is unbounded, speed is not.
    expect(LINER_DWELL.maxFlow).toBeGreaterThan(linerSpeedFlow(0) + 0.3)
  })

  it('ramps up monotonically toward, but never past, maxFlow', () => {
    const samples = [0, 50, 150, 300, 600, 2000].map(ms => dwellFlow(ms, LINER_DWELL))
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1])
    expect(samples.at(-1)).toBeLessThan(LINER_DWELL.maxFlow)
    expect(samples.at(-1)).toBeGreaterThan(LINER_DWELL.maxFlow - 0.01) // effectively saturated by 2s
  })

  it('only liner opts into dwell today', () => {
    expect(dwellConfigForTool('liner')).toBe(LINER_DWELL)
    expect(dwellConfigForTool('pencil')).toBeNull()
    expect(dwellConfigForTool('eraser')).toBeNull()
    expect(dwellConfigForTool('smudge')).toBeNull()
  })
})

describe('linerTiltFlow', () => {
  it('is neutral at ordinary writing angles', () => {
    expect(linerTiltFlow(0)).toBe(1)
    expect(linerTiltFlow(30)).toBe(1)
    expect(linerTiltFlow(54.9)).toBe(1)
  })

  it('reduces flow only mildly in the 55-70deg range', () => {
    const at60 = linerTiltFlow(60)
    expect(at60).toBeLessThan(1)
    expect(at60).toBeGreaterThan(0.9)
  })

  it('reduces flow a bit more past 70deg, still bounded', () => {
    expect(linerTiltFlow(90)).toBeCloseTo(0.85)
    expect(linerTiltFlow(90)).toBeGreaterThan(0.8)
  })
})

describe('applyLinerEndTaper', () => {
  function makeDabs(n: number, size = 10): Dab[] {
    return Array.from({ length: n }, () => (
      { x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, size, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
    ))
  }

  it('is a no-op below the taper-start speed threshold', () => {
    const dabs = makeDabs(5)
    applyLinerEndTaper(dabs, 0.5)
    expect(dabs.every(d => d.size === 10)).toBe(true)
  })

  it('shrinks only the last few dabs, ramping toward the very last one, bounded to ~15%', () => {
    const dabs = makeDabs(6)
    applyLinerEndTaper(dabs, 10) // well past the "fully tapered" speed
    // Untouched: everything before the last 4.
    expect(dabs[0].size).toBe(10)
    expect(dabs[1].size).toBe(10)
    // Tapered window: strictly decreasing toward the end, each within 15%.
    for (let i = 2; i < dabs.length; i++) {
      expect(dabs[i].size).toBeLessThan(10)
      expect(dabs[i].size).toBeGreaterThan(8.4) // > 10 * (1 - 0.15) - epsilon
    }
    expect(dabs[5].size).toBeLessThan(dabs[2].size)
  })

  it('does nothing on an empty array', () => {
    expect(() => applyLinerEndTaper([], 10)).not.toThrow()
  })
})

describe('linerWickPx (#452, ADR 003 §4)', () => {
  it('is the same absolute distance for a wide nib as for a wider one — not a fraction of the line', () => {
    // The whole point of the "absolute" rule: capillary reach belongs to the
    // ink/paper pair, so once a nib is wide enough to clear the cap, drawing
    // it wider must not spread the ink any further.
    expect(linerWickPx(20)).toBe(LINER_WICK_PX)
    expect(linerWickPx(200)).toBe(LINER_WICK_PX)
  })

  it('caps against the dab radius so the thinnest pen keeps more line than halo', () => {
    // LINER_SIZE_PX (toolSchemas.ts) puts 0.1mm at a 2px diameter, i.e. r=1 —
    // uncapped, the band would be wider than the mark itself.
    expect(linerWickPx(1)).toBe(LINER_WICK_RADIUS_CAP)
    expect(linerWickPx(1)).toBeLessThan(LINER_WICK_PX)
  })

  it('never returns a negative band for a degenerate radius', () => {
    expect(linerWickPx(0)).toBe(0)
    expect(linerWickPx(-5)).toBe(0)
  })

  it('rises monotonically with radius up to the cap, then flattens', () => {
    const widths = [0.5, 1, 2, 3, 4, 8, 16].map(linerWickPx)
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1])
    expect(widths.at(-1)).toBe(LINER_WICK_PX)
  })
})
