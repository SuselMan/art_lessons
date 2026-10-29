import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceSpray/consumer.native.json'
import { KritaRandomSource } from './nativeRandom'
import { planSourceSprayEmitter, type SourceSprayEmitter } from './sourceSprayEmitter'
import { sourceSprayInverseCDF } from './sourceSprayDistribution'

const normal = sourceSprayInverseCDF(fixture.cdf.map(([x, cumulative, inverseDelta]) => ({ x, cumulative, inverseDelta })))
function emitter(c: typeof fixture.cases[number]): SourceSprayEmitter {
  return { ...c, radial: c.normal ? normal : { kind: 'uniform' } } as SourceSprayEmitter
}
describe('source spray consumer plan (native bodies, capture-only stubs)', () => {
  for (const c of fixture.cases) it(c.name, () => {
    const input = new KritaRandomSource(c.seed).snapshot()
    const before = structuredClone(input)
    const result = planSourceSprayEmitter(emitter(c), c.request, input, { maximumParticles: 12, captureDraws: true })
    expect(input).toEqual(before)
    expect(result.particles).toHaveLength(c.expected.particles.length)
    expect(result.draws!.map(d => ({ kind: d.kind === 'frame' ? 'I' : 'U', value: d.value }))).toEqual(c.expected.draws)
    // This bounded frame policy is inclusive native uniform_smallint, not a
    // general rejection sampler. The separate nativeRandom fixture proves it.
    expect(result.random.draws).toBe(c.expected.draws.length)
    for (let i = 0; i < result.particles.length; i++) {
      const p = result.particles[i], native = c.expected.particles[i]
      for (const key of ['x', 'y', 'angle'] as const) expect(Math.abs(p[key] - native[key])).toBeLessThan(1e-12)
      expect(p.inkOpacity).toBe(native.ink)
      expect(p.painterOpacity).toBe(native.painter)
      expect(p.hsv ?? [0, 0, 0]).toEqual(native.hsv)
      expect(p.frame ?? -1).toBe(native.frame)
      if (c.particle.kind === 'ellipse') {
        expect(p.width).toBe(native.width)
        expect(p.height).toBe(native.height)
      } else expect(p.tipScale).toBe(native.scale)
    }
  })
  it('restored state and plain cloning continue exactly without mutating the incoming source', () => {
    const c = fixture.cases[2], e = emitter(c), initial = new KritaRandomSource(c.seed).snapshot()
    const first = planSourceSprayEmitter(e, c.request, initial, { maximumParticles: 3 })
    const continued = planSourceSprayEmitter(e, c.request, structuredClone(first.random), { maximumParticles: 3 })
    const source = KritaRandomSource.restore(initial)
    for (let i = 0; i < first.random.draws; i++) source.generate()
    expect(planSourceSprayEmitter(e, c.request, source.snapshot(), { maximumParticles: 3 })).toEqual(continued)
    expect(first.random.draws).toBe(16)
    expect(continued.random.draws).toBe(32)
  })
  it('rejects over-budget work before touching even an invalid random DTO', () => {
    const c = fixture.cases[0]
    expect(() => planSourceSprayEmitter(emitter(c), c.request, { version: 1, state: [0, 0, 0], draws: -1 }, { maximumParticles: 11 })).toThrow('budget')
  })
  it('rejects non-integer source dimensions and malformed controls before emission', () => {
    const c = fixture.cases[0], base = emitter(c), state = new KritaRandomSource(c.seed).snapshot()
    for (const candidate of [
      { ...base, particle: { ...base.particle, width: 1.5 } },
      { ...base, rotation: { randomWeight: NaN } },
      { ...base, particle: { ...base.particle, frameCount: 257 } },
    ]) expect(() => planSourceSprayEmitter(candidate, c.request, state, { maximumParticles: 12 })).toThrow()
    expect(state.draws).toBe(0)
  })
  it('cloud collapse preserves particle size and the random schedule', () => {
    const original = fixture.cases.find(c => c.name === 'hearts')!
    const zero = fixture.cases.find(c => c.name === 'zero-cloud')!
    const run = (c: typeof original) => planSourceSprayEmitter(emitter(c), c.request, new KritaRandomSource(c.seed).snapshot(), { maximumParticles: 3 })
    const a = run(original), b = run(zero)
    expect(a.random).toEqual(b.random)
    b.particles.forEach((p, i) => { expect(p.x).toBe(zero.request.x); expect(p.y).toBe(zero.request.y); expect(p.tipScale).toBe(a.particles[i].tipScale) })
  })
})
