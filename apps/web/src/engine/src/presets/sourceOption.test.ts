import { describe, expect, it } from 'vitest'
import oracle from './fixtures/sourceOption.native.json'
import { KritaPerStrokeRandomSource, KritaRandomSource } from './nativeRandom'
import { sourceOptionComponents, sourceRotationLike, sourceSizeLike, sourceStandardOption, sourceTransfer, type SourceOption, type SourceSensor } from './sourceOption'
const context = () => ({ random: new KritaRandomSource(4321), perStroke: new KritaPerStrokeRandomSource(7654), hover: false })
const option = (sensors: readonly SourceSensor[], overrides: Partial<SourceOption> = {}): SourceOption => ({ id: 'Size', checked: true, useCurve: true, curveMode: 0, strength: .73, min: 0, max: 1, sensors, ...overrides })
describe('isolated source option components', () => {
  it('matches 192 compiled pinned native method cases exactly', () => {
    const inputs: SourceSensor[] = [
      { id: 'pressure', kind: 'scaling', parameter: .19 },
      { id: 'pressureIn', kind: 'scaling', parameter: .83 },
      { id: 'xTilt', kind: 'additive', parameter: -.37 },
      { id: 'rotation', kind: 'absolute', parameter: .24 },
    ]
    for (const row of oracle.cases) {
      const sensors = inputs.filter((_, i) => (row.mask & (1 << i)) !== 0)
      const c = sourceOptionComponents(option(sensors, { curveMode: row.mode, useCurve: row.mask !== 15 }), context(), !!row.strength)
      expect(sourceSizeLike(c), JSON.stringify(row)).toBe(row.size)
      const rotation: number[] = []
      for (const flip of [false, true]) for (const disable of [false, true]) rotation.push(sourceRotationLike(c, -.17, flip, -1, disable))
      expect(rotation).toEqual(row.rotation)
    }
  })
  it('matches compiled native transfer epsilon, out-of-range and sign branches exactly', () => {
    const table = Array.from({ length: 256 }, (_, i) => (i * i + 3) / 65028)
    for (const row of oracle.transfer.cases) expect(sourceTransfer(row.input, table)).toBe(row.output)
    expect(sourceTransfer(-0, table)).toBeGreaterThan(0) // KisAlgebra2D copysign uses y>=0, not signbit.
    const ctx = context()
    const c = sourceOptionComponents(option([{ id: 'fuzzyPerDab', kind: 'additive', transfer: table }]), ctx)
    const u = context().random.generateNormalized()
    expect(c.additive).toBe(-1 + 2 * sourceTransfer(.5 * (1 + (2 * u - 1)), table))
  })
  it('uses one sequential stream, independent keyed parent option names, and source order', () => {
    const ctx = context()
    const expected = context()
    const dab = 2 * expected.random.generateNormalized() - 1
    const stroke = 2 * expected.perStroke.generateNormalized('SizeFuzzyStroke') - 1
    const sensors: SourceSensor[] = [
      { id: 'fuzzyPerStroke', kind: 'additive' }, { id: 'fuzzyPerDab', kind: 'additive' },
      { id: 'time', kind: 'scaling', parameter: .3 }, { id: 'pressure', kind: 'scaling', parameter: .4 },
    ]
    const c = sourceOptionComponents(option(sensors), ctx)
    expect(c.additive).toBe(dab + stroke)
    expect(c.scaling).toBe(.4 * .3)
    expect(ctx.random.snapshot()).toEqual(expected.random.snapshot())
    expect(ctx.perStroke.snapshot()).toEqual(expected.perStroke.snapshot())
    sourceOptionComponents(option(sensors, { id: 'Rotation' }), ctx)
    expect(ctx.random.snapshot().draws).toBe(2)
    expect(ctx.perStroke.snapshot().cache.map(([key]) => key)).toEqual(['SizeFuzzyStroke', 'RotationFuzzyStroke'])
  })
  it('unchecked/useCurve false/hover branches consume no sequential or keyed draws', () => {
    const sensors: SourceSensor[] = [{ id: 'fuzzyPerDab', kind: 'additive' }, { id: 'fuzzyPerStroke', kind: 'additive' }]
    const ctx = context()
    expect(sourceStandardOption(option(sensors, { checked: false }), ctx)).toBe(1)
    expect(sourceSizeLike(sourceOptionComponents(option(sensors, { useCurve: false }), ctx))).toBe(.73)
    expect(sourceOptionComponents(option(sensors), { ...ctx, hover: true }).additive).toBe(0)
    expect(ctx.random.snapshot().draws).toBe(0)
    expect(ctx.perStroke.snapshot().cache).toEqual([])
  })
  it('fails closed on malformed native transfer rather than approximating its curve', () => {
    expect(() => sourceOptionComponents(option([{ id: 'fuzzyPerDab', kind: 'additive', transfer: [0, 1] }]), context())).toThrow('256-entry')
  })
})
