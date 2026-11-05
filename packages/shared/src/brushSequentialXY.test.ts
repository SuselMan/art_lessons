import { describe, expect, it } from 'vitest'
import { isBrushBehavior } from './brushBehavior.js'
import { brushRequiresRandomContext, hasBrushSourceInputs, isBrushSequentialXYCompatible, type BrushDescriptor } from './brushes.js'
import type { Dab } from './stroke.js'
const policy = { version: 1, kind: 'qt5Taus88', policy: 'scatterXY' } as const
function brush(): BrushDescriptor {
  return {
    id: 'source-policy', version: 1, model: 'stamp', category: 'wet',
    tip: { kind: 'round', profile: { kind: 'gaussian', fade: 1, antialias: false }, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' },
    pressureSmoothingPx: 0, paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'stamp', opacity: 1,
    sizeByPressure: [[0, .4], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
    scatter: { radius: .09, count: 1, scale: 1, sizeJitter: 0, angleJitter: 0, flowJitter: 0 },
    behavior: { version: 2, sequentialRandom: policy, scatter: { placement: 'xyUniform', bothAxes: true, countJitter: 0 } },
  }
}
describe('explicit sequential XY capability', () => {
  it('requires an exact versioned capability and explicit random context', () => {
    expect(isBrushBehavior(brush().behavior)).toBe(true)
    expect(isBrushSequentialXYCompatible(brush())).toBe(true)
    expect(brushRequiresRandomContext(brush())).toBe(true)
    for (const invalid of [{ ...policy, version: 2 }, { ...policy, extra: true }, { ...policy, policy: 'all' }, null]) {
      expect(isBrushBehavior({ version: 2, sequentialRandom: invalid })).toBe(false)
    }
  })
  it('rejects other consumers and unsupported spacing state without relying on names', () => {
    for (const mutate of [
      (b: BrushDescriptor) => { b.paperInteraction = .1 },
      (b: BrushDescriptor) => { b.behavior!.erase = true },
      (b: BrushDescriptor) => { b.behavior!.falloff = 1 },
      (b: BrushDescriptor) => { b.scatter!.angleJitter = .1 },
      (b: BrushDescriptor) => { b.behavior!.dynamics = { scatter: { control: 'random', minimum: 0, jitter: 0 } } },
      (b: BrushDescriptor) => { b.behavior!.spacing = { mode: 'kritaAuto', coefficient: 1, dynamics: [{ control: 'dabProgress', minimum: 0, jitter: 0 }] } },
    ]) { const b = brush(); mutate(b); expect(isBrushSequentialXYCompatible(b)).toBe(false) }
  })
  it('requires paired allocation inputs for every request, including endpoint-only', () => {
    const b=brush(), d={ sourceSize: 1, sourceScale: 0 } as Dab
    expect(hasBrushSourceInputs(b,[d],d)).toBe(true)
    expect(hasBrushSourceInputs(b,[])).toBe(true)
    for (const bad of [{}, {sourceSize:1}, {sourceSize:1.5,sourceScale:1}, {sourceSize:1,sourceScale:1.1}, {sourceSize:0,sourceScale:0}]) {
      expect(hasBrushSourceInputs(b,[bad as Dab])).toBe(false)
      expect(hasBrushSourceInputs(b,[],bad as Dab)).toBe(false)
    }
    delete b.behavior!.sequentialRandom
    expect(hasBrushSourceInputs(b,[{} as Dab])).toBe(true)
  })
})
