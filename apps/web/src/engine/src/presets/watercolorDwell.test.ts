// (#680, ADR 011 §17.74) The brush's surplus along the whole stroke: the dwell
// read at every dab, the slowdown relative to the stroke's own pace, and the
// carried surplus that turns them into a pool.
import { describe, expect, it } from 'vitest'

import {
  WC_DWELL_FLOOR_MS, watercolorExcessFromSurplus, watercolorPuddleFromSurplus, watercolorSlowdown,
  watercolorBrakeSurplus, watercolorSurplus, watercolorTrailDwell, watercolorPuddleDepth, WC_START_EXCESS_RADII,
} from './watercolorPresets'

describe('watercolorTrailDwell', () => {
  it('is the time the nib has stayed within the radius of where it is now', () => {
    const trail = [{ x: 0, y: 0, t: 0 }, { x: 50, y: 0, t: 100 }, { x: 51, y: 0, t: 300 }, { x: 52, y: 0, t: 600 }]
    expect(watercolorTrailDwell(trail, 53, 0, 700, 5)).toBe(600)
  })
  it('stops at the first dab outside the radius', () => {
    const trail = [{ x: 0, y: 0, t: 0 }, { x: 60, y: 0, t: 100 }]
    expect(watercolorTrailDwell(trail, 0, 0, 200, 5)).toBe(0)
  })
  it('is zero with no trail yet', () => {
    expect(watercolorTrailDwell([], 0, 0, 50, 5)).toBe(0)
  })
})

describe('watercolorSlowdown', () => {
  it('is 0 at the stroke\'s own pace and 1 standing still', () => {
    expect(watercolorSlowdown(2, 2)).toBeCloseTo(0)
    expect(watercolorSlowdown(0, 2)).toBeCloseTo(1)
  })
  it('rises as the pen brakes', () => {
    expect(watercolorSlowdown(0.5, 2)).toBeGreaterThan(watercolorSlowdown(1, 2))
  })
  it('is relative: the same braking reads the same at any hand speed', () => {
    expect(watercolorSlowdown(0.2, 1)).toBeCloseTo(watercolorSlowdown(2, 10))
  })
  it('is 0 before there is a pace to brake from', () => {
    expect(watercolorSlowdown(0, 0)).toBe(0)
  })
})

describe('watercolorSurplus', () => {
  it('takes the higher of the carried surplus and this dab\'s level', () => {
    expect(watercolorSurplus(0.2, 0, 0.7, 1)).toBe(0.7)
    expect(watercolorSurplus(0.9, 0, 0.1, 1)).toBe(0.9)
  })
  it('is spent over the travel after the slowdown', () => {
    expect(watercolorSurplus(1, 1, 0, 1)).toBeCloseTo(Math.exp(-1))
  })
})

describe('the carried surplus against the landing-only model it generalises', () => {
  it('with no surplus the excess is the landing base alone', () => {
    // the base term of watercolorStartExcess at no dwell
    const a = watercolorExcessFromSurplus(0, 0, 0)
    const b = watercolorExcessFromSurplus(8 * WC_START_EXCESS_RADII, 0, 0)
    expect(a).toBeGreaterThan(1)
    expect(b).toBeCloseTo(1, 2)
  })
  it('a wet landing adds no base', () => {
    expect(watercolorExcessFromSurplus(0, 1, 0)).toBe(1)
  })
  it('the puddle with no surplus and dry paper is the film', () => {
    expect(watercolorPuddleFromSurplus(0, 0)).toBeCloseTo(watercolorPuddleDepth(10, 0, 0, 0))
  })
  it('the dwell floor is what a steady hand spends crossing the radius anyway', () => {
    expect(WC_DWELL_FLOOR_MS).toBeGreaterThan(0)
  })
})

 describe('braking duration', () => {
  it('does not unload extra pigment without elapsed time', () => {
    expect(watercolorBrakeSurplus(0, 0, 0.8, 0)).toBe(0)
    expect(watercolorBrakeSurplus(0.4, 0, 0.8, 0)).toBe(0.4)
  })
  it('unloads visibly during a short turn, with a sustained stop stronger', () => {
    expect(watercolorBrakeSurplus(0, 0, 0.8, 20)).toBeGreaterThan(0.45)
    expect(watercolorBrakeSurplus(0, 0, 0.8, 20)).toBeLessThan(0.6)
    expect(watercolorBrakeSurplus(0, 0, 0.8, 600)).toBeGreaterThan(0.45)
  })
  it('integrates the same stationary slowdown across different batch sizes', () => {
    let held = 0
    for (let i = 0; i < 10; i++) held = watercolorBrakeSurplus(held, 0, 0.8, 20)
    expect(held).toBeCloseTo(watercolorBrakeSurplus(0, 0, 0.8, 200), 10)
  })
})
