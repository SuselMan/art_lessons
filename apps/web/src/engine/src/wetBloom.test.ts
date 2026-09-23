import { describe, expect, it } from 'vitest'

import {
  makeWetGrid, wetDiffuseStepMany, totalPigment,
  WET_DIFFUSE_SCHEDULE, WET_DIFFUSE_D, WET_DIFFUSE_B,
  type WetDiffuseOpts,
} from './wetDiffusion'

// #536, ADR 011 §17.23. The two effects the reference base puts first
// (docs/reference/watercolor-effects.md, effects 2 and 3) proved on the CPU
// oracle before a shader line: the TIDELINE — a stroke's own paint carried to
// its puddle's rim as the rim dries first — and the BLOOM — a drop of water
// into a damp wash pushing the wash's settled paint outward to the drop's
// dry line, where it piles up in a ragged ring with a lighter interior.
// Neither is diffusion; diffusion smooths, both of these concentrate. What
// does it is paint drifting DOWN a water-pressure gradient until the gate
// closes (wetDiffuseStepMany's `pressure` and `gateThreshold`).

const N = 128, C = 64

function runSchedule(grid: ReturnType<typeof makeWetGrid>, pigment: Float64Array, opts: WetDiffuseOpts, d = WET_DIFFUSE_D): Float64Array {
  let f = [pigment]
  for (const st of WET_DIFFUSE_SCHEDULE) f = wetDiffuseStepMany(grid, f, d, WET_DIFFUSE_B, st.radius, st.knight, opts)
  return f[0]
}

function radialProfile(p: Float64Array, R: number, bins: number): number[] {
  const sum = new Float64Array(bins), cnt = new Float64Array(bins)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - C, y - C) / R
      if (r >= 1) continue
      const b = Math.min(bins - 1, Math.floor(r * bins))
      sum[b] += p[y * N + x]; cnt[b]++
    }
  }
  return Array.from(sum, (v, i) => cnt[i] ? v / cnt[i] : 0)
}

function minOf(p: Float64Array): number {
  let m = Infinity
  for (let i = 0; i < p.length; i++) if (p[i] < m) m = p[i]
  return m
}

describe('tideline and bloom on the oracle (#536, ADR 011 §17.23)', () => {
  it('carries a puddle\'s paint to its rim: the outer band ends darker than the centre', () => {
    // A disc of uniform paint in its own puddle, the water a dome that runs
    // out at the rim. Paint drifts down the dome and stops where the gate
    // closes; the last open band collects it. The plain schedule (no
    // pressure) leaves the disc as flat as it found it — the control.
    const R = 30
    const rows: string[] = []
    let chosen = 0
    for (const pr of [0, 0.05, 0.1, 0.2]) {
      const g = makeWetGrid(N, N)
      const pig = new Float64Array(N * N), pressure = new Float64Array(N * N)
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const r = Math.hypot(x - C, y - C) / R
          if (r < 1) { g.water[y * N + x] = 1 - r * r; pressure[y * N + x] = 1 - r * r; pig[y * N + x] = 1 }
        }
      }
      const before = totalPigment(pig)
      const out = runSchedule(g, pig, { pressure, pressureRate: pr })
      const prof = radialProfile(out, R, 20)
      const centre = (prof[0] + prof[1] + prof[2]) / 3
      const rim = (prof[17] + prof[18] + prof[19]) / 3
      rows.push(`pressureRate ${pr}: rim/centre ${(rim / centre).toFixed(2)}, peak ${Math.max(...prof).toFixed(2)} at r/R ${((prof.indexOf(Math.max(...prof)) + 0.5) / 20).toFixed(2)}, min ${minOf(out).toFixed(3)}`)
      expect(totalPigment(out) / before).toBeCloseTo(1, 9)
      expect(minOf(out)).toBeGreaterThanOrEqual(0)
      if (pr === 0) expect(rim / centre).toBeCloseTo(1, 6)
      if (pr === 0.2) chosen = rim / centre
    }
    console.log('tideline:\n  ' + rows.join('\n  '))
    expect(chosen).toBeGreaterThanOrEqual(1.5)
  })

  it('blooms: a drop into a damp wash rings the wash\'s paint at the drop\'s dry line and leaves the rest alone', () => {
    // A wide damp wash (water 0.3) of settled paint, one everywhere; a drop
    // of water (1.0, a soft edge five cells wide, a dome of pressure) in the
    // middle. The gate threshold sits between damp and wet, so only the paint
    // under the drop may move: it drifts to the drop's edge and piles up in a
    // ring, the interior lightens, and nothing outside changes by a bit.
    // The drop's FRONT is what is ragged: water runs further into the
    // sheet's valleys than over its crests, so the drop's edge (its water and
    // its pressure alike) is displaced by the paper's height, and the front
    // is sharp — a cell wide. The ring then tracks that front ray by ray
    // (correlation, below) where a smooth front gives none. Two things
    // measured and worth knowing before the GPU port: modulating only the
    // gate THRESHOLD moves the ring by under a cell (the pile-up sits where
    // the drift runs out of gate, inside the threshold line, and the coarse
    // stencil steps jump single closed cells); and even with a ragged front
    // the ring's own wander is about half the front's (0.6 vs 1.2 cells) —
    // the multi-scale schedule smooths the azimuth. A cauliflower edge at
    // the paper's scale wants a fine-radius advection stage after the
    // coarse steps, or the front's own geometry drawn as the ring.
    const R = 24, SOFT = 1
    const hash = (x: number, y: number): number => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s) }
    const rings: Record<string, number> = {}
    const rows: string[] = []
    for (const ragged of [0, 2.5]) {
      const g = makeWetGrid(N, N)
      const pig = new Float64Array(N * N).fill(1), pressure = new Float64Array(N * N), thr = new Float64Array(N * N)
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x
          // The sheet: blocky noise four cells across, -1..1.
          const h = (hash(Math.floor(x / 4), Math.floor(y / 4)) - 0.5) * 2
          g.paperHeight[i] = h
          // The front, displaced by the sheet: `ragged` cells per unit height.
          const r = Math.hypot(x - C, y - C) + ragged * h
          const drop = r < R - SOFT ? 1 : r < R ? (R - r) / SOFT : 0
          g.water[i] = 0.3 + 0.7 * drop
          pressure[i] = Math.max(0, 1 - (Math.max(r, 0) / R) ** 2)
          // Between damp and wet: the wash's own water never opens the gate.
          thr[i] = 0.5
        }
      }
      const before = totalPigment(pig)
      const out = runSchedule(g, pig, { pressure, pressureRate: 0.1, gateThreshold: thr })
      let outsideMax = 0, inner = 0, innerN = 0
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x, r = Math.hypot(x - C, y - C)
          if (r > R + 5) outsideMax = Math.max(outsideMax, Math.abs(out[i] - 1))
          if (r < R * 0.6) { inner += out[i]; innerN++ }
        }
      }
      inner /= innerN
      // Per ray: where the front is (water crossing the threshold) and where
      // the ring is (the squared-excess-weighted mean radius over the edge
      // zone), then how the two move together around the drop.
      const front: number[] = [], radii: number[] = []
      for (let a = 0; a < 72; a++) {
        const ang = a / 72 * Math.PI * 2
        let m = 0, mr = 0, fr = -1
        for (let r = R - 9; r <= R + 4; r += 0.5) {
          const x = Math.round(C + Math.cos(ang) * r), y = Math.round(C + Math.sin(ang) * r), i = y * N + x
          if (fr < 0 && g.water[i] <= 0.5) fr = r
          const v = Math.max(out[i] - inner, 0) ** 2
          m += v; mr += v * r
        }
        front.push(fr < 0 ? R : fr)
        radii.push(m > 0 ? mr / m : R)
      }
      const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length
      const std = (xs: number[]): number => { const mu = mean(xs); return Math.sqrt(mean(xs.map(v => (v - mu) ** 2))) }
      const mf = mean(front), mr = mean(radii)
      let cov = 0
      for (let k = 0; k < radii.length; k++) cov += (front[k] - mf) * (radii[k] - mr)
      const corr = std(front) > 0.3 ? cov / (radii.length * std(front) * std(radii)) : 0
      const peak = Math.max(...out)
      rows.push(`ragged ${ragged}: interior ${inner.toFixed(3)}, ring peak ${peak.toFixed(2)} (x${(peak / inner).toFixed(2)}), front ${mf.toFixed(1)} ± ${std(front).toFixed(2)}, ring ${mr.toFixed(1)} ± ${std(radii).toFixed(2)} cells, corr(ring, front) ${corr.toFixed(2)}, outside change ${outsideMax.toExponential(1)}, min ${minOf(out).toFixed(3)}`)
      expect(totalPigment(out) / before).toBeCloseTo(1, 9)
      expect(minOf(out)).toBeGreaterThanOrEqual(0)
      expect(outsideMax).toBe(0)
      expect(peak / inner).toBeGreaterThan(1.8)
      expect(inner).toBeLessThan(0.9)
      rings[String(ragged)] = corr
    }
    console.log('bloom:\n  ' + rows.join('\n  '))
    // The ragged front: the ring tracks it around the drop; a smooth front
    // has nothing to track.
    expect(rings['2.5']).toBeGreaterThan(0.4)
    expect(Math.abs(rings['0'])).toBeLessThan(0.4)
  })

  it('leaves the plain step exactly as it was without the options', () => {
    // The production pass is the plain step; the options must not change
    // its arithmetic by a bit when absent.
    const g = makeWetGrid(32, 32)
    g.water.fill(1)
    for (let i = 0; i < g.paperHeight.length; i++) g.paperHeight[i] = (i % 7) / 7
    const pig = new Float64Array(32 * 32)
    pig[16 * 32 + 16] = 1
    const a = wetDiffuseStepMany(g, [pig], WET_DIFFUSE_D, WET_DIFFUSE_B, 2, true)[0]
    const b = wetDiffuseStepMany(g, [pig], WET_DIFFUSE_D, WET_DIFFUSE_B, 2, true, {})[0]
    for (let i = 0; i < a.length; i++) expect(b[i]).toBe(a[i])
  })
})
