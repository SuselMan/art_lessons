import { describe, expect, it } from 'vitest'
import { isBrushBehavior } from './brushBehavior.js'
const source = { kind: 'qt5Taus88', key: 'RotationFuzzyStroke' }
const dynamic = { control: 'strokeRandom', minimum: 0, jitter: 0, randomSource: source }
const accepts = (value: unknown) => isBrushBehavior({ version: 2, dynamics: { angle: value } })
describe('explicit native per-stroke random source', () => {
  it('retains legacy stream validation and accepts native exact keys', () => {
    expect(accepts(dynamic)).toBe(true)
    const { randomSource: _, ...legacy } = dynamic
    expect(accepts({ ...legacy, randomStream: 0 })).toBe(true)
    expect(accepts({ ...legacy, randomStream: 0xffffffff })).toBe(true)
    expect(accepts(legacy)).toBe(false)
    expect(accepts({ ...dynamic, randomStream: 0 })).toBe(false)
    expect(accepts({ ...dynamic, randomSource: { ...source, key: 'Ключ😀' } })).toBe(true)
  })
  it.each([null, [], {}, { ...source, kind: 'qt6' }, { ...source, key: '' }, { ...source, key: 'x'.repeat(129) }, { ...source, key: 'a\0b' }, { ...source, key: 1 }, { ...source, extra: 1 }])('rejects malformed source %j', randomSource => {
    expect(accepts({ ...dynamic, randomSource })).toBe(false)
  })
  it.each(['off', 'pressure', 'random', 'dabProgress'])('rejects native source on control %s', control => {
    expect(accepts({ ...dynamic, control })).toBe(false)
  })
  it('validates nested modulation and rotation composition sources', () => {
    expect(isBrushBehavior({ version: 2, modulations: { angle: [dynamic] } })).toBe(true)
    expect(isBrushBehavior({ version: 2, rotation: { follow: 0, random: 'none', composition: { strength: 1, additive: [dynamic] } } })).toBe(true)
    expect(isBrushBehavior({ version: 2, modulations: { angle: [{ ...dynamic, randomStream: 1 }] } })).toBe(false)
  })
})
