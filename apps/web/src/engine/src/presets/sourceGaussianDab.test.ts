import { describe, expect, it, vi } from 'vitest'
import native from './fixtures/sourceGaussianWholePath/whole.native.json'
import { prepareSourceGaussianDab, sourceGaussianDab, type SourceGaussianDabRequest } from './sourceGaussianDab'
function request(index = 0): SourceGaussianDabRequest {
  const c = native.cases[index], g = c.generator
  return { dialect: 'krita-gaussian-auto-qt5-arm64-v1', tip: {
    kind: 'auto', generator: 'gauss', shape: 'circle', diameter: +g.diameter, ratio: +g.ratio,
    horizontalFade: +g.hfade, verticalFade: +g.vfade, spikes: 2, softness: 1, randomness: 0, density: 1,
    antialias: g.antialiasEdges !== '0',
  }, storedScale: c.storedScale, storedAngle: c.storedAngle, shape: { ...c.shape },
  subpixelX: c.subpixelX, subpixelY: c.subpixelY,
  coverageProfile: c.mode === 'scalar-common' ? 'scalar-bionic-f64-fma-v1' : 'neon64-f32-fma-v1',
  maxPixels: 1024 * 1024, maxWorkSamples: 16 * 1024 * 1024 }
}
describe('isolated whole Gaussian dab CPU service', () => {
  it('matches104 original whole-dab windows, raw coverage geometry and29098 mask bytes from raw brush/shape inputs', () => {
    let pixels = 0
    for (let i = 0; i < native.cases.length; i++) {
      const expected = native.cases[i], input = request(i), before = structuredClone(input)
      const actual = sourceGaussianDab(input)
      expect(actual.geometry.maskSize).toEqual([expected.width, expected.height])
      expect(actual.center).toEqual(expected.processing.slice(2, 4))
      expect(actual.generatorScale).toEqual(expected.generatorScale)
      expect([Math.cos(actual.coverageAngle), Math.sin(actual.coverageAngle)]).toEqual(expected.processing.slice(4, 6))
      expect(actual.route === 'neon64-vector').toBe(expected.vectorBranch)
      expect(Buffer.from(actual.mask).toString('base64')).toBe(expected.coverageBase64)
      expect(input).toEqual(before)
      pixels += actual.mask.length
    }
    expect(pixels).toBe(29098)
  })
  it('owns each output and rejects invalid profiles, coefficients and work reservations before A8 allocation', () => {
    const r = request(), first = sourceGaussianDab(r), second = sourceGaussianDab(r)
    expect(first.mask).not.toBe(second.mask)
    first.mask.fill(42)
    expect(second.mask.some(x => x !== 42)).toBe(true)
    const invalid = [
      { ...r, maxPixels: 1 }, { ...r, maxWorkSamples: 1 }, { ...r, maxPixels: 1024 * 1024 + 1 },
      { ...r, tip: { ...r.tip, ratio: 0 } }, { ...r, tip: { ...r.tip, spikes: 9 } },
      { ...r, coverageProfile: 'unproven-profile' }, { ...r, subpixelY: 1 },
      { ...r, shape: { ...r.shape, scale: Number.MIN_VALUE } },
    ]
    let allocations = 0
    const errors: unknown[] = []
    vi.stubGlobal('Uint8Array', class { constructor() { allocations++; throw new Error('unexpected allocation') } })
    try { for (const input of invalid) try { sourceGaussianDab(input as SourceGaussianDabRequest) } catch (error) { errors.push(error) } }
    finally { vi.unstubAllGlobals() }
    expect(allocations).toBe(0)
    expect(errors).toHaveLength(invalid.length)
    for (const error of errors) expect(error).toBeInstanceOf(RangeError)
  })
})


describe('incremental Gaussian coverage', () => {
  it('matches all104 native masks through tiny sample budgets and unaligned bounded stripes', () => {
    const routes = new Set<number>()
    for (let i = 0; i < native.cases.length; i++) {
      const prepared = prepareSourceGaussianDab(request(i)), e = prepared.evaluator
      routes.add(e.samplesPerPixel)
      const bytes: number[] = []
      let call = 0, consumed = 0
      while (!e.done) {
        const stripe = new Uint8Array(9).fill(199)
        const budget = [1, 2, 7, 31][call++ % 4]
        const step = e.advance(stripe, 2, budget)
        expect(step.consumed).toBeLessThanOrEqual(budget)
        expect(step.written).toBeLessThanOrEqual(7)
        expect([...stripe.slice(0, 2)]).toEqual([199, 199])
        expect([...stripe.slice(2 + step.written)].every(x => x === 199)).toBe(true)
        bytes.push(...stripe.slice(2, 2 + step.written)); consumed += step.consumed
      }
      expect(Buffer.from(bytes).toString('base64')).toBe(native.cases[i].coverageBase64)
      expect(e.completedPixels).toBe(e.pixels)
      expect(consumed).toBe(e.pixels * e.samplesPerPixel)
      expect(e.workSamples).toBe(consumed)
      expect(e.advance(new Uint8Array(1), 0, 1)).toEqual({ written: 0, consumed: 0, done: true })
    }
    expect([...routes].sort((a, b) => a - b)).toEqual([1, 36])
  })
  it('retains the nine-sample sum across pauses for a synthetic medium-size request', () => {
    // Existing native104 include1/36 samples only; this is continuation coverage,
    // not an additional original-native oracle claim.
    const r = request()
    Object.assign(r.tip, { diameter: 5, ratio: 1, antialias: true })
    Object.assign(r.shape, { scale: 1, ratio: 1 })
    const e = prepareSourceGaussianDab(r).evaluator
    expect(e.samplesPerPixel).toBe(9)
    const expected = sourceGaussianDab(r).mask, actual: number[] = []
    let samples = 0
    while (!e.done) {
      const byte = new Uint8Array(1)
      const step = e.advance(byte, 0, 1)
      samples += step.consumed
      if (step.written) actual.push(byte[0])
    }
    expect(new Uint8Array(actual)).toEqual(expected)
    expect(samples).toBe(e.pixels * 9)
  })
  it('owns inputs and can cancel within a supersampled pixel without writing it', () => {
    const index = native.cases.findIndex((_, i) => {
      const e = prepareSourceGaussianDab(request(i)).evaluator
      return e.samplesPerPixel === 36
    })
    expect(index).toBeGreaterThanOrEqual(0)
    const r = request(index), e = prepareSourceGaussianDab(r).evaluator
    Object.assign(r.tip, { diameter: 999, antialias: false })
    Object.assign(r.shape, { scale: 999, rotation: 12 })
    const target = new Uint8Array(4).fill(127)
    expect(e.advance(target, 1, 1)).toEqual({ written: 0, consumed: 1, done: false })
    expect([...target]).toEqual([127, 127, 127, 127])
    for (const [offset, budget] of [[-1, 1], [5, 1], [0, 0], [0, 1.5]]) {
      expect(() => e.advance(target, offset, budget)).toThrow(RangeError)
      expect(e.workSamples).toBe(1)
    }
    const full = new Uint8Array(e.pixels)
    while (!e.done) e.advance(full, e.completedPixels, 7)
    expect(Buffer.from(full).toString('base64')).toBe(native.cases[index].coverageBase64)
    const cancelled = prepareSourceGaussianDab(request(index)).evaluator
    cancelled.advance(target, 1, 1); cancelled.cancel(); cancelled.cancel()
    expect(() => cancelled.advance(target, 1, 1)).toThrow('cancelled')
    expect(cancelled.workSamples).toBe(1)
  })
})
