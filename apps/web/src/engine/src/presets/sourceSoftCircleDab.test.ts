import { describe, expect, it, vi } from 'vitest'
import tables from './fixtures/sourceSoftCircle/tables.native.json'
import full600 from './fixtures/sourceSoftCircle/full600.native.json'
import whole from './fixtures/sourceSoftCircle/whole.native.json'
import { compileSourceSoftCircleProgram, sourceSoftCircleDab, type SourceSoftCircleDabRequest, type SourceSoftCircleProgram } from './sourceSoftCircleDab'
function compile(row = tables.constructors[0]): SourceSoftCircleProgram {
  const g = row.generator
  return compileSourceSoftCircleProgram({ kind: 'auto', generator: 'soft', shape: 'circle', diameter: +g.diameter,
    ratio: +g.ratio, horizontalFade: +g.hfade, verticalFade: +g.vfade, spikes: 2, softness: 1, randomness: 0, density: 1, antialias: false },
  { points: row.points, coefficients: row.coefficients.map(c => [c[0], c[1], c[2], c[3]] as const) }, row.values.length)
}
function request(row = whole.cases[0], program = compile()): SourceSoftCircleDabRequest {
  return { dialect: 'krita-soft-circle-qt5-arm64-v1', program, storedScale: row.storedScale, storedAngle: row.storedAngle,
    shape: { ...row.shape }, subpixelX: row.subpixelX, subpixelY: row.subpixelY,
    coverageProfile: row.mode === 'scalar-common' ? 'scalar-f64-fma-v1' : 'neon64-f32-fma-v1',
    maxPixels: 1024 * 1024, maxWorkSamples: 16 * 1024 * 1024 }
}
describe('compiled original-resolution soft-circle CPU dab', () => {
  it('matches40 original whole masks/40864 A8 bytes and geometry across allfive radial stock programs', () => {
    const programs = new Map(tables.constructors.map(row => [row.index, compile(row)]))
    let pixels = 0, vectors = 0
    for (const row of whole.cases) {
      const input = request(row, programs.get(row.index)!), before = { ...input, shape: { ...input.shape } }
      const actual = sourceSoftCircleDab(input)
      expect(actual.geometry.maskSize).toEqual([row.width, row.height])
      expect(actual.center).toEqual(row.processing.slice(2, 4))
      expect([Math.cos(actual.coverageAngle), Math.sin(actual.coverageAngle)]).toEqual(row.processing.slice(4, 6))
      expect(actual.generatorScale).toEqual(row.generatorScale)
      expect(actual.route === 'neon64-vector').toBe(row.vectorBranch)
      expect(Buffer.from(actual.mask).toString('base64')).toBe(row.coverageBase64)
      expect(input).toEqual(before)
      pixels += actual.mask.length; vectors += +(actual.route === 'neon64-vector')
    }
    expect(pixels).toBe(40864); expect(vectors).toBe(20)
  })
  it('matches all360000 A8 bytes of the independent full saved600x600 native NEON mask', () => {
    const row = full600.case, actual = sourceSoftCircleDab(request(row, compile()))
    expect(actual.geometry.maskSize).toEqual([600, 600])
    expect(actual.center).toEqual([299.5, 299.5])
    expect(actual.route).toBe('neon64-vector')
    expect(Buffer.from(actual.mask).toString('base64')).toBe(row.coverageBase64)
  })
  it('compiles once at original600px resolution and deeply owns the immutable program', () => {
    const native = tables.constructors[0]
    const points = native.points.map(p => ({ ...p })), coefficients = native.coefficients.map(c => [c[0], c[1], c[2], c[3]] as [number, number, number, number])
    const tip = { ...compile().tip }, program = compileSourceSoftCircleProgram(tip, { points, coefficients }, 2402)
    points[0].y = 1; coefficients[0][3] = 1; tip.diameter = 1
    expect(program.tip.diameter).toBe(600); expect(program.table).toHaveLength(2402)
    expect(program.table[0]).toBe(native.values[0])
    expect(Object.isFrozen(program.table)).toBe(true); expect(Object.isFrozen(program.curve.coefficients[0])).toBe(true)
    const input = request(whole.cases[0], program), a = sourceSoftCircleDab(input), b = sourceSoftCircleDab(input)
    expect(a.mask).not.toBe(b.mask); a.mask.fill(42); expect(b.mask.some(v => v !== 42)).toBe(true)
    expect(input.program).toBe(program); expect(program.table).toHaveLength(2402)
    expect(() => compileSourceSoftCircleProgram(program.tip, program.curve, 2401)).toThrow(RangeError)
  })
  it('rejects forged programs, unsupported AA/softness and quota/finite failures before A8 allocation', () => {
    const r = request(), p = r.program
    expect(() => compileSourceSoftCircleProgram({ ...p.tip, antialias: true } as never, p.curve, 2402)).toThrow(RangeError)
    expect(() => compileSourceSoftCircleProgram({ ...p.tip, softness: .5 } as never, p.curve, 2402)).toThrow(RangeError)
    const invalid = [{ ...r, program: { ...p } }, { ...r, maxPixels: 1 }, { ...r, maxWorkSamples: 1 },
      { ...r, subpixelX: 1 }, { ...r, storedAngle: Infinity }, { ...r, shape: { ...r.shape, scale: Number.MIN_VALUE } },
      { ...r, coverageProfile: 'unproven' }]
    let allocations = 0
    const errors: unknown[] = []
    vi.stubGlobal('Uint8Array', class { constructor() { allocations++; throw new Error('unexpected A8 allocation') } })
    try { for (const input of invalid) try { sourceSoftCircleDab(input as SourceSoftCircleDabRequest) } catch (error) { errors.push(error) } }
    finally { vi.unstubAllGlobals() }
    expect(allocations).toBe(0); expect(errors).toHaveLength(invalid.length)
    for (const error of errors) expect(error).toBeInstanceOf(RangeError)
  })
})
