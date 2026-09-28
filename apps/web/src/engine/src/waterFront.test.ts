import { describe, expect, it } from 'vitest'

import {
  makeWaterGrid, dropWater, propagate, waterDomain, frontProfile, frontStats, frontHeightBias, syntheticPaper,
  wettingCost, wettingDomain, discSeed, WATER_FRONT_DEFAULT, WETTING_COST_DEFAULT,
} from './waterFront'

// #536, ADR 011 §17.24. The water domain of one drop, measured the way the
// design thread asked: a point drop, a few propagation steps over the paper,
// one threshold, and numbers against the photograph bloom_wa_drop.jpg
// (docs/reference/watercolor-effects.md): the ring's outer contour sits
// about 1.3 drop radii out, its radius wanders ~10–20 % with the angle, in
// ten-odd lobes, and it runs further where the paper is low.

const S = 192, R = 30, CX = 96, CY = 96

describe('water front (#536, ADR 011 §17.24)', () => {
  it('a wetting cost over the paper reaches past the drop, unevenly, along the valleys', () => {
    const paper = syntheticPaper(S, S, 1)
    const seed = discSeed(S, S, CX, CY, R)
    const cost = wettingCost(S, S, paper, seed, 14, { ...WETTING_COST_DEFAULT, climb: 60, budget: 10 })
    const dom = wettingDomain(cost, 10)
    const st = frontStats(frontProfile(dom, S, S, CX, CY))
    // Past the drop, but not a flood.
    expect(st.mean / R).toBeGreaterThan(1.15)
    expect(st.mean / R).toBeLessThan(1.45)
    // Ragged with the paper, in lobes.
    expect(st.std / st.mean).toBeGreaterThan(0.05)
    expect(st.std / st.mean).toBeLessThan(0.2)
    expect(st.fingers).toBeGreaterThanOrEqual(6)
    // The front stalls on ridges and advances in valleys: it sits lower than
    // the paper around it.
    const hb = frontHeightBias(dom, paper, S, S)
    expect(hb.front).toBeLessThan(hb.outside - 0.01)
    console.log(`wetting cost: R_front/R_drop ${(st.mean / R).toFixed(2)}, spread ${(st.std / st.mean).toFixed(3)}, fingers ${st.fingers}, front height ${hb.front.toFixed(3)} vs outside ${hb.outside.toFixed(3)}`)
  })

  it('is a pure function of its inputs, and flat paper gives a round front', () => {
    const paper = syntheticPaper(S, S, 3)
    const seed = discSeed(S, S, CX, CY, R)
    const a = wettingCost(S, S, paper, seed, 12)
    const b = wettingCost(S, S, paper, seed, 12)
    expect(Array.from(a)).toEqual(Array.from(b))
    const flat = new Float64Array(S * S).fill(0.5)
    const dom = wettingDomain(wettingCost(S, S, flat, seed, 12), 10)
    const st = frontStats(frontProfile(dom, S, S, CX, CY))
    expect(st.std / st.mean).toBeLessThan(0.03)
    expect(st.mean).toBeGreaterThan(R + 8)
  })

  it('the fractional propagation stalls within a few cells whatever the paper — the measurement that ruled it out', () => {
    // Kept as the record of why the front is a cost and not a flow: each
    // step moves the film one cell and thins it geometrically, so four steps
    // on a radius-30 drop reach 1.07 radii on any paper, against 1.3 on the
    // photograph. Mass is conserved less what dry cells drink.
    const g = makeWaterGrid(S, S, syntheticPaper(S, S, 1))
    dropWater(g, CX, CY, R, 1)
    const before = g.water.reduce((s, v) => s + v, 0)
    const absorbed = propagate(g, 4, WATER_FRONT_DEFAULT)
    const after = g.water.reduce((s, v) => s + v, 0)
    expect(after + absorbed).toBeCloseTo(before, 6)
    const st = frontStats(frontProfile(waterDomain(g), S, S, CX, CY))
    expect(st.mean / R).toBeLessThan(1.15)
  })
})
