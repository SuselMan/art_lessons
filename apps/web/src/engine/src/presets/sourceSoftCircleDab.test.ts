import { describe, expect, it, vi } from 'vitest'
import tables from './fixtures/sourceSoftCircle/tables.native.json'
import full600 from './fixtures/sourceSoftCircle/full600.native.json'
import whole from './fixtures/sourceSoftCircle/whole.native.json'
import { compileSourceSoftCircleProgram, prepareSourceSoftCircleDab, sourceSoftCircleDab, type SourceSoftCircleDabRequest, type SourceSoftCircleProgram } from './sourceSoftCircleDab'
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
  it('retains full-geometry vector tails across arbitrary bounded stripes for all40 independent native masks', () => {
    const programs = new Map(tables.constructors.map(row => [row.index, compile(row)]))
    for (const quantum of [1, 3, 63, 64, 65]) for (const row of whole.cases) {
      const prepared = prepareSourceSoftCircleDab(request(row, programs.get(row.index)!)), evaluator = prepared.evaluator
      const expected = Buffer.from(row.coverageBase64, 'base64'), chunks: Uint8Array[] = []
      expect(evaluator.completedPixels).toBe(0); expect(evaluator.workSamples).toBe(0)
      while (!evaluator.done) {
        const previous = evaluator.completedPixels, stripe = new Uint8Array(quantum + 2).fill(231)
        const progress = evaluator.advance(stripe.subarray(1, stripe.length - 1), 0, quantum)
        if (progress.consumed > quantum || progress.written <= 0 || progress.written !== progress.consumed
          || evaluator.completedPixels - previous !== progress.written || stripe[0] !== 231 || stripe[stripe.length - 1] !== 231) {
          throw new Error(`Invalid bounded stripe for native brush ${row.index}, quantum ${quantum}`)
        }
        chunks.push(stripe.slice(1, 1 + progress.written))
      }
      expect(Buffer.concat(chunks)).toEqual(expected)
      expect(evaluator.completedPixels).toBe(expected.length); expect(evaluator.workSamples).toBe(expected.length)
      expect(prepared.geometry.maskSize).toEqual([row.width, row.height])
    }
  })
  it('prepares a600x600 cursor without allocating its full mask and fills it in64-sample turns', () => {
    const input = request(full600.case, compile())
    let allocations = 0, prepared: ReturnType<typeof prepareSourceSoftCircleDab>
    vi.stubGlobal('Uint8Array', class { constructor() { allocations++; throw new Error('unexpected full mask allocation') } })
    try { prepared = prepareSourceSoftCircleDab(input) } finally { vi.unstubAllGlobals() }
    expect(allocations).toBe(0); expect(prepared.evaluator.pixels).toBe(360000)
    const expected = Buffer.from(full600.case.coverageBase64, 'base64'), stripe = new Uint8Array(64)
    let offset = 0
    while (!prepared.evaluator.done) {
      const progress = prepared.evaluator.advance(stripe, 0, 64)
      if (progress.consumed > 64 || progress.written <= 0 || !expected.subarray(offset, offset + progress.written).equals(stripe.subarray(0, progress.written))) {
        throw new Error(`Bounded600 native mismatch at ${offset}`)
      }
      offset += progress.written
    }
    expect(offset).toBe(expected.length)
  })
  it('owns arithmetic inputs between yields and cancels before any further samples or writes', () => {
    const input = request(), prepared = prepareSourceSoftCircleDab(input), expected = sourceSoftCircleDab(input)
    const output = new Uint8Array(prepared.evaluator.pixels), first = prepared.evaluator.advance(output, 0, 3)
    expect(first).toEqual({ written: 3, consumed: 3, done: false })
    // Returned metadata is descriptive; changing it cannot change the stream.
    Object.assign(input.shape, { scale: 1, ratio: .3, rotation: .7 })
    Object.assign(input, { storedAngle: .9, coverageProfile: 'scalar-f64-fma-v1' })
    Object.assign(prepared.center, { 0: 999, 1: 999 })
    while (!prepared.evaluator.done) prepared.evaluator.advance(output, prepared.evaluator.completedPixels, 7)
    expect(output).toEqual(expected.mask)
    const cancelled = prepareSourceSoftCircleDab(request()).evaluator, target = new Uint8Array(8).fill(177)
    cancelled.advance(target, 0, 3); const before = target.slice(), samples = cancelled.workSamples
    cancelled.cancel(); cancelled.cancel()
    expect(() => cancelled.advance(target, 3, 3)).toThrow('cancelled')
    expect(target).toEqual(before); expect(cancelled.workSamples).toBe(samples)
  })
  it('rejects invalid continuations without consuming the stream and stops at caller stripe capacity', () => {
    const evaluator = prepareSourceSoftCircleDab(request()).evaluator, target = new Uint8Array(7).fill(177)
    for (const [offset, quantum] of [[-1, 1], [8, 1], [.5, 1], [0, 0], [0, NaN], [0, Infinity]]) {
      expect(() => evaluator.advance(target, offset, quantum)).toThrow(RangeError)
      expect(evaluator.completedPixels).toBe(0); expect(evaluator.workSamples).toBe(0)
    }
    expect(evaluator.advance(target, 7, 3)).toEqual({ written: 0, consumed: 0, done: false })
    expect(evaluator.advance(target, 5, 64)).toEqual({ written: 2, consumed: 2, done: false })
    expect(target.slice(0, 5)).toEqual(new Uint8Array(5).fill(177))
    expect(evaluator.completedPixels).toBe(2); expect(evaluator.workSamples).toBe(2)
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
