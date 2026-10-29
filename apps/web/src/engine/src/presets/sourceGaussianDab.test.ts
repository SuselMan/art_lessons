import { describe, expect, it, vi } from 'vitest'
import native from './fixtures/sourceGaussianWholePath/whole.native.json'
import { sourceGaussianDab, type SourceGaussianDabRequest } from './sourceGaussianDab'
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
