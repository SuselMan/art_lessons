import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import native from './fixtures/sourceDefaultAutoMask/coverage.native.json'
import { prepareSourceDefaultAutoMask, sourceDefaultAutoMaskReference, type SourceDefaultAutoMaskRequest } from './sourceDefaultAutoMaskReference'
function request(index = 0): SourceDefaultAutoMaskRequest { return native.cases[index].request as SourceDefaultAutoMaskRequest }
describe('sourceDefaultAutoMaskReference', () => {
  it('matches every byte of all 84 independent original scalar and NEON-dispatch calls', () => {
    expect(native.cases).toHaveLength(84)
    let vectorCalls = 0, pixels = 0
    for (const c of native.cases) {
      const result = sourceDefaultAutoMaskReference(c.request as SourceDefaultAutoMaskRequest)
      expect(Buffer.from(result.mask).toString('base64'), `${c.index}/${c.variant}/${c.request.profile}`).toBe(c.expectedBase64)
      expect(createHash('sha256').update(result.mask).digest('hex')).toBe(c.expectedSHA256)
      expect(result.route === 'neon64-vector').toBe(c.vectorBranch)
      vectorCalls += +(result.route === 'neon64-vector'); pixels += result.mask.length
    }
    expect(vectorCalls).toBe(16)
    expect(pixels).toBe(29916)
  })
  it('keeps scalar quantization and native NEON prefix/tail quantization distinct', () => {
    let different = 0, max = 0
    for (let i = 0; i < native.cases.length; i += 2) {
      const a = sourceDefaultAutoMaskReference(request(i)), b = sourceDefaultAutoMaskReference(request(i + 1))
      for (let p = 0; p < a.mask.length; p++) if (a.mask[p] !== b.mask[p]) { different++; max = Math.max(max, Math.abs(a.mask[p] - b.mask[p])) }
    }
    expect(different).toBe(676)
    expect(max).toBe(1)
  })
  it('selects the source 3x3/6x6 scalar fallback from effective raw generator dimensions', () => {
    const counts = new Set(native.cases.map((_, i) => sourceDefaultAutoMaskReference(request(i)).samplesPerPixel))
    expect(counts).toEqual(new Set([1, 9, 36]))
  })
  it('rejects unsupported source behavior and exhausted work/allocation budgets', () => {
    const r = request()
    for (const patch of [{ generator: 'gaussian' }, { spikes: 3 }, { softness: .5 }, { randomness: .1 }, { density: .5 }, { antialias: 1 }]) {
      expect(() => sourceDefaultAutoMaskReference({ ...r, tip: { ...r.tip, ...patch } } as SourceDefaultAutoMaskRequest)).toThrow(RangeError)
    }
    expect(() => sourceDefaultAutoMaskReference({ ...r, maxPixels: r.width * r.height - 1 })).toThrow(RangeError)
    expect(() => sourceDefaultAutoMaskReference({ ...request(4), maxWorkSamples: 1 })).toThrow(RangeError)
    expect(() => sourceDefaultAutoMaskReference({ ...r, profile: 'guess' } as unknown as SourceDefaultAutoMaskRequest)).toThrow(RangeError)
    expect(() => sourceDefaultAutoMaskReference({ ...r, width: Infinity })).toThrow(RangeError)
  })
})


describe('incremental full-geometry coverage cursor', () => {
  it('matches all original native bytes across partial samples and awkward stripes', () => {
    for (const c of native.cases) for (const quantum of [1, 17, 64]) {
      const evaluator = prepareSourceDefaultAutoMask(c.request as SourceDefaultAutoMaskRequest)
      const bytes: number[] = []
      while (!evaluator.done) {
        const stripe = new Uint8Array(7)
        let offset = 0
        while (offset < stripe.length && !evaluator.done) {
          const step = evaluator.advance(stripe, offset, quantum)
          expect(step.consumed).toBeLessThanOrEqual(quantum)
          expect(step.consumed).toBeGreaterThan(0)
          offset += step.written
        }
        bytes.push(...stripe.subarray(0, offset))
      }
      expect(Buffer.from(bytes).toString('base64'), `${c.index}/${quantum}`).toBe(c.expectedBase64)
      expect(evaluator.workSamples).toBe(evaluator.pixels * evaluator.samplesPerPixel)
    }
  })
  it('captures immutable parameters and does not consume on invalid output or cancellation', () => {
    const r = structuredClone(request(4))
    const evaluator = prepareSourceDefaultAutoMask(r)
    ;(r.tip as { diameter: number }).diameter = 500
    expect(() => evaluator.advance(new Uint8Array(1), -1, 1)).toThrow(RangeError)
    expect(evaluator.workSamples).toBe(0)
    const result = new Uint8Array(evaluator.pixels)
    while (!evaluator.done) evaluator.advance(result, evaluator.completedPixels, 17)
    expect(Buffer.from(result).toString('base64')).toBe(native.cases[4].expectedBase64)
    const cancelled = prepareSourceDefaultAutoMask(request(4))
    cancelled.advance(new Uint8Array(1), 0, 1)
    const work = cancelled.workSamples
    cancelled.cancel(); cancelled.cancel()
    expect(() => cancelled.advance(new Uint8Array(1), 0, 1)).toThrow('cancelled')
    expect(cancelled.workSamples).toBe(work)
  })
})
