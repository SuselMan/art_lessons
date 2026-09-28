import { describe, expect, it } from 'vitest'

import {
  pigmentAbsorption, mixtureColor, filmTransmittance, quantizeDepth, hueOf,
  PIGMENT_DEPTH_SCALE,
} from './pigmentOptics'
import { makeWetGrid, wetDiffuseStepMany, WET_DIFFUSE_SCHEDULE } from './wetDiffusion'

// #536, ADR 011 §17.19. The colour of a mixture, proved on the CPU before a
// channel of it exists on the GPU — the same discipline as the diffusion's
// own oracle, and for the same reason: "did it go green" is a question a
// number answers and a screenshot argues about.

const ULTRAMARINE: readonly [number, number, number] = [0.16, 0.23, 0.59]
const YELLOW: readonly [number, number, number] = [1.0, 0.9, 0.1]

function disc(grid: ReturnType<typeof makeWetGrid>, cx: number, cy: number, r: number, field: Float64Array, value: number) {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) field[y * grid.width + x] = value
    }
  }
}

describe('pigment optics (#536, ADR 011 §17.19)', () => {
  it('renders one paint as exactly the colour it carries', () => {
    // A single pigment's mixture colour is its own transmittance, whatever
    // the mass — the geometric mean of one thing is that thing.
    const tau = pigmentAbsorption(ULTRAMARINE)
    for (const mass of [0.05, 0.5, 2]) {
      const depth: [number, number, number] = [tau[0] * mass, tau[1] * mass, tau[2] * mass]
      const c = mixtureColor(depth, mass, [1, 1, 1])
      expect(c[0]).toBeCloseTo(ULTRAMARINE[0], 9)
      expect(c[1]).toBeCloseTo(ULTRAMARINE[1], 9)
      expect(c[2]).toBeCloseTo(ULTRAMARINE[2], 9)
    }
  })

  it('makes green out of blue and yellow, where an average would make grey', () => {
    const tb = pigmentAbsorption(ULTRAMARINE), ty = pigmentAbsorption(YELLOW)
    const depth: [number, number, number] = [tb[0] + ty[0], tb[1] + ty[1], tb[2] + ty[2]]
    const mixed = mixtureColor(depth, 2, [1, 1, 1])
    // Green: the green channel leads, and the hue sits in the greens.
    expect(mixed[1]).toBeGreaterThan(mixed[0])
    expect(mixed[1]).toBeGreaterThan(mixed[2])
    const hue = hueOf(mixed)
    expect(hue).toBeGreaterThan(70)
    expect(hue).toBeLessThan(160)
    // …and the RGB average of the same two paints is not.
    const avg: [number, number, number] = [
      (ULTRAMARINE[0] + YELLOW[0]) / 2, (ULTRAMARINE[1] + YELLOW[1]) / 2, (ULTRAMARINE[2] + YELLOW[2]) / 2,
    ]
    expect(avg[0]).toBeGreaterThan(avg[1] - 0.05)
    // The film itself darkens with depth: two layers' worth is darker than one.
    const one = filmTransmittance(tb), two = filmTransmittance([tb[0] * 2, tb[1] * 2, tb[2] * 2])
    expect(two[2]).toBeLessThan(one[2])
  })

  it('mixes in the puddle by transport: blue left, yellow right, green between, edges their own', () => {
    // The design thread's test, and the one that proves mixing, transport and
    // conservation at once. Mass and the three depths ride the same donor
    // fractions, so the mixture's colour anywhere is whatever pigment reached
    // it — the middle gets both, the far edges keep their parent.
    const g = makeWetGrid(96, 48)
    disc(g, 48, 24, 46, g.water, 1)
    const n = g.width * g.height
    const mass = new Float64Array(n), dr = new Float64Array(n), dg = new Float64Array(n), db = new Float64Array(n)
    const tb = pigmentAbsorption(ULTRAMARINE), ty = pigmentAbsorption(YELLOW)
    const lay = (x: number, tau: number[]) => {
      for (let y = 20; y < 28; y++) {
        for (let xx = x - 3; xx <= x + 3; xx++) {
          const i = y * g.width + xx
          mass[i] += 1; dr[i] += tau[0]; dg[i] += tau[1]; db[i] += tau[2]
        }
      }
    }
    // (s17.29) Nine texels apart, from thirty-six: the schedule is the fine
    // smoothing now, carrying a drop across a puddle is the water front's
    // job (index.ts, mode 15 of WC_FIELD_OP_FRAG).
    lay(41, tb)
    lay(55, ty)
    const before = [mass, dr, dg, db].map(f => f.reduce((a, v) => a + v, 0))
    let fields: Float64Array[] = [mass, dr, dg, db]
    for (const st of WET_DIFFUSE_SCHEDULE) fields = wetDiffuseStepMany(g, fields, undefined, undefined, st.radius, st.knight)
    // Conserved, per channel, to the last bit.
    fields.forEach((f, k) => expect(f.reduce((a, v) => a + v, 0)).toBeCloseTo(before[k], 9))
    const colourAt = (x: number) => {
      const i = 24 * g.width + x
      return mixtureColor([fields[1][i], fields[2][i], fields[3][i]], fields[0][i], [1, 1, 1])
    }
    const left = colourAt(34), mid = colourAt(48), right = colourAt(62)
    expect(fields[0][24 * g.width + 48]).toBeGreaterThan(1e-4)
    // Middle: green.
    expect(mid[1]).toBeGreaterThan(mid[0])
    expect(mid[1]).toBeGreaterThan(mid[2])
    // Far left: still blue-led; far right: still yellow-led.
    expect(left[2]).toBeGreaterThan(left[0])
    expect(right[0]).toBeGreaterThan(right[2])
    expect(hueOf(right)).toBeLessThan(hueOf(mid))
    expect(hueOf(left)).toBeGreaterThan(hueOf(mid))
  })

  it('survives eight bits at the chosen scale: weak glazes stay, mixtures keep their hue', () => {
    // The format is a measured choice, not a belief (the design thread's
    // one insistence here). Twenty weak passes of one pigment, ten and ten of
    // two, each quantised on the way in as the GPU's additive write would be,
    // then the schedule with a quantisation after every step: what survives.
    const tb = pigmentAbsorption(ULTRAMARINE), ty = pigmentAbsorption(YELLOW)
    const weak = 0.05
    for (const scale of [1, 2, PIGMENT_DEPTH_SCALE, 8]) {
      // One pigment, twenty weak additions: the sum should be near 20 × weak.
      let d = 0
      for (let i = 0; i < 20; i++) d = quantizeDepth(d + weak * tb[2], scale)
      const lost = 1 - d / (20 * weak * tb[2])
      if (scale <= PIGMENT_DEPTH_SCALE) expect(lost).toBeLessThan(0.15)
      // Two pigments, ten and ten, then the schedule with a quantised write
      // after each step on a flat wet grid.
      const g = makeWetGrid(48, 48)
      g.water.fill(1)
      const n = 48 * 48
      const mass = new Float64Array(n), dr = new Float64Array(n), dg = new Float64Array(n), db = new Float64Array(n)
      // A dab is many texels, not one: a 9x9 patch, so the transport below has
      // a body to move rather than a point that any format would lose.
      const c = 24 * 48 + 24
      const cells: number[] = []
      for (let y = 20; y <= 28; y++) for (let x = 20; x <= 28; x++) cells.push(y * 48 + x)
      for (let i = 0; i < 10; i++) {
        for (const k of cells) {
          mass[k] = quantizeDepth(mass[k] + weak, 1)
          dr[k] = quantizeDepth(dr[k] + weak * tb[0], scale); dg[k] = quantizeDepth(dg[k] + weak * tb[1], scale); db[k] = quantizeDepth(db[k] + weak * tb[2], scale)
          dr[k] = quantizeDepth(dr[k] + weak * ty[0], scale); dg[k] = quantizeDepth(dg[k] + weak * ty[1], scale); db[k] = quantizeDepth(db[k] + weak * ty[2], scale)
          mass[k] = quantizeDepth(mass[k] + weak, 1)
        }
      }
      const exact = mixtureColor([tb[0] + ty[0], tb[1] + ty[1], tb[2] + ty[2]], 2, [1, 1, 1])
      const got = mixtureColor([dr[c], dg[c], db[c]], mass[c], [1, 1, 1])
      const hueErr = Math.abs(hueOf(got) - hueOf(exact))
      console.log(`scale ${scale}: lost ${lost.toFixed(3)} of twenty weak passes, hue error ${hueErr.toFixed(1)} deg, got`, got.map(v => v.toFixed(3)), 'exact', exact.map(v => v.toFixed(3)))
      if (scale <= PIGMENT_DEPTH_SCALE) expect(hueErr).toBeLessThan(25)
      let fields: Float64Array[] = [mass, dr, dg, db]
      for (const st of WET_DIFFUSE_SCHEDULE.slice(4)) {
        fields = wetDiffuseStepMany(g, fields, undefined, undefined, st.radius, st.knight)
        fields = fields.map((f, k) => f.map(v => quantizeDepth(v, k === 0 ? 1 : scale)))
      }
      // After transport the mixture at the centre is still green-led, and
      // the mass that was laid is still mostly there (quantisation loses the
      // thinnest fringe, never the body).
      const mid = mixtureColor([fields[1][c], fields[2][c], fields[3][c]], fields[0][c], [1, 1, 1])
      if (scale <= PIGMENT_DEPTH_SCALE) {
        // Green-led within a code: after eight quantised passes the red and
        // green channels can land on the same code, which is still green-led
        // against the blue that the yellow took out.
        expect(mid[1]).toBeGreaterThanOrEqual(mid[0] - 0.01)
        expect(mid[1]).toBeGreaterThan(mid[2] + 0.05)
      }
    }
  })
})
