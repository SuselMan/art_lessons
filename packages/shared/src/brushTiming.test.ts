import { describe, expect, it } from 'vitest'
import { isBrushBehavior, type BrushBehavior, type BrushDynamic } from './brushBehavior.js'
import { brushRequiresSourceTime, hasBrushSourceInputs, isBrushLibrary, type BrushDescriptor } from './brushes.js'
import type { Dab } from './stroke.js'

const timing = { version: 1, rate: 20, ignoreDistanceSpacing: false } as const
const clock: BrushDynamic = { control: 'time', minimum: 0, jitter: 0, period: 1470, periodic: true }
const brush = (behavior?: BrushBehavior): BrushDescriptor => ({
  id: 'imported-1234567890abcdef', version: 1, model: 'stamp', category: 'paint',
  tip: { kind: 'round', hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' },
  paperInteraction: 0, pressureSmoothingPx: 0, spacing: .1, flow: 1, flowPer: 'stamp', opacity: 1,
  sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
  ...(behavior ? { behavior } : {}),
})
const library = (descriptor: BrushDescriptor) => ({ schemaVersion: 1, assets: [], brushes: [{ name: 'Timing', source: 'Timing.kpp', warnings: [], descriptor }], skipped: [] })

describe('author timing capability', () => {
  it('accepts explicit timing without changing legacy descriptor admission', () => {
    expect(isBrushBehavior({ version: 2 })).toBe(true)
    for (const rate of [0, .01, 20, 343.61, 1000]) {
      expect(isBrushBehavior({ version: 2, timing: { ...timing, rate } })).toBe(true)
    }
  })
  it('rejects malformed timing and unsupported random timer consumption', () => {
    for (const invalid of [null, [], {}, { ...timing, version: 2 }, { ...timing, extra: true }, { ...timing, rate: -1 }, { ...timing, rate: 1001 }, { ...timing, rate: NaN }, { ...timing, rate: Infinity }, { ...timing, ignoreDistanceSpacing: 1 }]) {
      expect(isBrushBehavior({ version: 2, timing: invalid })).toBe(false)
    }
    const factor = { control: 'pressure', minimum: 0, jitter: 0 }
    expect(isBrushBehavior({ version: 2, timing: { ...timing, rateDynamics: [factor] } })).toBe(true)
    for (const rateDynamics of [[], Array(5).fill(factor), [{ ...factor, control: 'random' }], [{ ...factor, jitter: .1 }], [clock], 'pressure']) {
      expect(isBrushBehavior({ version: 2, timing: { ...timing, rateDynamics } })).toBe(false)
    }
  })
  it('defines time periods in integer milliseconds independently of dab sequence periods', () => {
    for (const period of [1, 1470, 2147483647]) {
      expect(isBrushBehavior({ version: 2, dynamics: { size: { ...clock, period } } })).toBe(true)
    }
    for (const period of [undefined, 0, .5, 2147483648, NaN, Infinity]) {
      expect(isBrushBehavior({ version: 2, dynamics: { size: { ...clock, period } } })).toBe(false)
    }
    expect(isBrushBehavior({ version: 2, dynamics: { size: { ...clock, periodic: undefined } } })).toBe(false)
    expect(isBrushBehavior({ version: 2, dynamics: { size: { ...clock, control: 'pressure' } } })).toBe(false)
    expect(isBrushBehavior({ version: 2, dynamics: { size: { ...clock, control: 'dabProgress', period: 1000001 } } })).toBe(false)
  })
  it('finds actual time consumers, including independent child sensors', () => {
    expect(brushRequiresSourceTime(brush())).toBe(false)
    expect(brushRequiresSourceTime(brush({ version: 2, timing }))).toBe(true)
    const behaviors: BrushBehavior[] = [
      { version: 2, dynamics: { size: clock } }, { version: 2, modulations: { opacity: [clock] } },
      { version: 2, colorAdjustment: { hue: clock } },
      { version: 2, spacing: { mode: 'diameter', coefficient: 1, dynamics: [clock] } },
      { version: 2, rotation: { follow: 0, random: 'none', composition: { strength: 1, additive: [clock] } } },
      { version: 2, wetMix: { dilution: 0, charge: 1, attack: 0, pull: 0, grade: 0, blur: 0, blurJitter: 0, wetnessJitter: 0, dynamics: { blur: [clock] } } },
      { version: 2, dual: { blendMode: 'normal', sampling: 'independent', brush: brush({ version: 2, dynamics: { size: clock } }) } },
    ]
    for (const behavior of behaviors) expect(brushRequiresSourceTime(brush(behavior))).toBe(true)
    const mixer = brush()
    mixer.model = 'mixer'
    mixer.mixer = { load: 1, pickup: 1, strength: 1, source: 'previousCanvas', pickupDynamics: [clock] }
    expect(brushRequiresSourceTime(mixer)).toBe(true)
  })
  it('requires recorded time for every new request and optional endpoint but permits empty final chunks', () => {
    const b = brush({ version: 2, timing }), dab = { sourceTime: 0 } as Dab
    expect(hasBrushSourceInputs(b, [dab], dab)).toBe(true)
    expect(hasBrushSourceInputs(b, [])).toBe(true)
    for (const sourceTime of [undefined, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = { sourceTime } as Dab
      expect(hasBrushSourceInputs(b, [invalid])).toBe(false)
      expect(hasBrushSourceInputs(b, [], invalid)).toBe(false)
    }
    expect(hasBrushSourceInputs(brush(), [{} as Dab])).toBe(true)
  })
  it('combines direction, allocation and clock requirements without granting absent inputs', () => {
    const b = brush({ version: 2, timing, strokeInput: { version: 1, initialDirection: 'cursorHistory' } })
    expect(hasBrushSourceInputs(b, [{ sourceTime: 0 } as Dab])).toBe(false)
    expect(hasBrushSourceInputs(b, [{ sourceTime: 0, sourceAngle: 0 } as Dab])).toBe(true)
  })
  it('rejects independent child timing but admits a child inheriting the author clock', () => {
    const child = brush({ version: 2, dynamics: { size: clock } })
    const parent = brush({ version: 2, dual: { brush: child, sampling: 'independent', blendMode: 'normal' } })
    expect(isBrushLibrary(library(parent))).toBe(true)
    child.behavior = { version: 2, timing }
    expect(isBrushLibrary(library(parent))).toBe(false)
  })
})
