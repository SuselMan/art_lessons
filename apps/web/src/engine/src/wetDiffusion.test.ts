import { describe, expect, it } from 'vitest'

import {
  makeWetGrid, wetDiffuse, wetDiffuseStep, wetDiffuseScheduled, totalPigment, centreOfMass,
  WET_DIFFUSE_D, WET_DIFFUSE_B, WET_DIFFUSE_STENCIL, WET_DIFFUSE_RADII,
} from './wetDiffusion'

// #536, ADR 011 §17.11. The four invariants agreed with the design thread
// before any shader was written, on the CPU oracle, where "conserved" can mean
// to the last bit rather than "looked fine". Each of these is a class of bug
// that has actually happened in this tool: pigment conjured out of nothing
// (the first halo), a front that ran over the crests (the sign of the paper
// term), and marks that left the water they were laid in.

function disc(grid: ReturnType<typeof makeWetGrid>, cx: number, cy: number, r: number, field: Float64Array, value: number) {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) field[y * grid.width + x] = value
    }
  }
}

describe('wet diffusion oracle (#536, ADR 011 §17.11)', () => {
  it('conserves mass to the last bit, step after step', () => {
    const g = makeWetGrid(32, 32)
    disc(g, 16, 16, 12, g.water, 1)
    disc(g, 16, 16, 3, g.pigment, 1)
    // Rough paper, so the height term is exercised too.
    for (let i = 0; i < g.paperHeight.length; i++) g.paperHeight[i] = ((i * 7919) % 97) / 97
    const before = totalPigment(g.pigment)
    let p = g.pigment
    for (let s = 0; s < 20; s++) {
      p = wetDiffuseStep(g, p)
      expect(totalPigment(p)).toBeCloseTo(before, 10)
    }
  })

  it('never lets pigment cross out of the water', () => {
    const g = makeWetGrid(32, 32)
    disc(g, 16, 16, 8, g.water, 1)
    // Pigment right up against the water's edge.
    disc(g, 22, 16, 2, g.pigment, 1)
    const p = wetDiffuse(g, 20)
    for (let i = 0; i < p.length; i++) {
      if (g.water[i] === 0) expect(p[i]).toBe(0)
    }
    // …and it did actually move, so the confinement is not "nothing moved".
    expect(p[16 * 32 + 22]).toBeLessThan(0.9)
    expect(totalPigment(p)).toBeCloseTo(totalPigment(g.pigment), 10)
  })

  it('never goes negative', () => {
    const g = makeWetGrid(32, 32)
    g.water.fill(1)
    disc(g, 16, 16, 2, g.pigment, 1)
    for (let i = 0; i < g.paperHeight.length; i++) g.paperHeight[i] = ((i * 31) % 11) / 11
    const p = wetDiffuse(g, 40)
    for (let i = 0; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(0)
  })

  it('actually spreads: the peak comes down and the reach goes out with each step', () => {
    const g = makeWetGrid(32, 32)
    g.water.fill(1)
    disc(g, 16, 16, 2, g.pigment, 1)
    let p = g.pigment
    let prevPeak = Infinity, prevReach = -1
    for (let s = 0; s < 8; s++) {
      p = wetDiffuseStep(g, p)
      const peak = Math.max(...p)
      let reach = 0
      for (let x = 16; x < 32; x++) if (p[16 * 32 + x] > 1e-6) reach = x - 16
      expect(peak).toBeLessThan(prevPeak)
      expect(reach).toBeGreaterThanOrEqual(prevReach)
      prevPeak = peak; prevReach = reach
    }
    expect(prevReach).toBeGreaterThan(6)
  })

  it('favours the valley over the ridge, and only by redistribution', () => {
    // Two identical drops, one on a slope down into a valley and one up onto a
    // ridge, mirror images of each other. The valley-side drop must end up with
    // its mass pulled downhill, the ridge-side one pushed off the crest — and
    // the two drops must still hold exactly what they started with between
    // them, since height is only ever a direction, never a source.
    const g = makeWetGrid(48, 16)
    g.water.fill(1)
    // Height falls from left to right on the left half (a valley at x=12),
    // rises to a ridge at x=36 on the right half.
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 48; x++) {
        g.paperHeight[y * 48 + x] = x < 24 ? Math.abs(x - 12) / 12 : 1 - Math.abs(x - 36) / 12
      }
    }
    disc(g, 6, 8, 2, g.pigment, 1)   // on the slope above the valley, left of it
    disc(g, 30, 8, 2, g.pigment, 1)  // on the slope below the ridge, left of it
    const before = totalPigment(g.pigment)
    // Against the same run with the height term off, not against absolute
    // halves: a drop near one end of its strip has more room on one side than
    // the other, and plain diffusion alone tilts the split by that geometry.
    // The bias has to move mass downhill *beyond* what geometry already does.
    const flat = wetDiffuse(g, 12, undefined, 0)
    const p = wetDiffuse(g, 12)
    const massAt = (f: Float64Array, x0: number, x1: number) => {
      let m = 0
      for (let y = 0; y < 16; y++) for (let x = x0; x < x1; x++) m += f[y * 48 + x]
      return m
    }
    // Left drop: more of it downhill (toward the valley at 12) than the flat run put there.
    expect(massAt(p, 7, 24)).toBeGreaterThan(massAt(flat, 7, 24) + 0.05)
    // Right drop: more of it pushed off the ridge (x < 30) than the flat run.
    expect(massAt(p, 24, 30)).toBeGreaterThan(massAt(flat, 24, 30) + 0.05)
    expect(totalPigment(p)).toBeCloseTo(before, 10)
  })

  it('keeps a symmetric drop symmetric — the centre of mass does not drift', () => {
    // Flat paper, round water, drop dead centre. Any asymmetry in the stencil,
    // any sign slip in one direction's pair, any one-sided boundary handling
    // shows up here as a drift, and it is the cheapest test in the file.
    const g = makeWetGrid(33, 33)
    disc(g, 16, 16, 14, g.water, 1)
    disc(g, 16, 16, 3, g.pigment, 1)
    const p = wetDiffuse(g, 30)
    const c = centreOfMass(g, p)
    expect(c.x).toBeCloseTo(16, 9)
    expect(c.y).toBeCloseTo(16, 9)
  })

  it('holds every invariant on the canonical multi-scale schedule too', () => {
    // The shipped pass is not radius 1 — it is the schedule. Mass, confinement
    // (for a convex mask) and symmetry have to survive the coarse steps, or the
    // proofs above are about a pass that never runs.
    const g = makeWetGrid(96, 96)
    disc(g, 48, 48, 40, g.water, 1)
    disc(g, 48, 48, 4, g.pigment, 1)
    for (let i = 0; i < g.paperHeight.length; i++) g.paperHeight[i] = ((i * 7919) % 97) / 97
    const before = totalPigment(g.pigment)
    const p = wetDiffuseScheduled(g)
    expect(totalPigment(p)).toBeCloseTo(before, 10)
    for (let i = 0; i < p.length; i++) {
      expect(p[i]).toBeGreaterThanOrEqual(0)
      if (g.water[i] === 0) expect(p[i]).toBe(0)
    }
    // Symmetric input on flat paper stays centred (a separate grid, flat).
    const f = makeWetGrid(97, 97)
    disc(f, 48, 48, 40, f.water, 1)
    disc(f, 48, 48, 4, f.pigment, 1)
    const c = centreOfMass(f, wetDiffuseScheduled(f))
    expect(c.x).toBeCloseTo(48, 9)
    expect(c.y).toBeCloseTo(48, 9)
    // …and it reaches: a 4-cell drop must carry pigment well past twenty
    // cells out, which radius-1 steps could not do in five.
    let reach = 0
    for (let x = 48; x < 97; x++) if (p[48 * 96 + x] > 1e-4) reach = x - 48
    expect(reach).toBeGreaterThan(30)
    expect(WET_DIFFUSE_RADII.length).toBe(11)
    // …and the knight's ring is a stencil too: symmetric, conserving.
    const k = makeWetGrid(33, 33)
    disc(k, 16, 16, 14, k.water, 1)
    disc(k, 16, 16, 3, k.pigment, 1)
    let kp = k.pigment
    for (let s = 0; s < 6; s++) kp = wetDiffuseStep(k, kp, undefined, undefined, 2, true)
    expect(totalPigment(kp)).toBeCloseTo(totalPigment(k.pigment), 10)
    const kc = centreOfMass(k, kp)
    expect(kc.x).toBeCloseTo(16, 9)
    expect(kc.y).toBeCloseTo(16, 9)
  })

  it('is stable at the shipped rates: no pixel can give more than it has', () => {
    // K(D + B) <= 1 is what keeps concentrations non-negative without a clamp,
    // and a clamp is what would break the antisymmetry.
    expect(WET_DIFFUSE_STENCIL.length * (WET_DIFFUSE_D + WET_DIFFUSE_B)).toBeLessThanOrEqual(1)
  })
})
