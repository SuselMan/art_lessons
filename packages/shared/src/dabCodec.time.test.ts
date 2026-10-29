import { describe, expect, it } from 'vitest'
import { packDabs, unpackDabs, strokeDabs } from './dabCodec.js'
import { canonicalStrokeStorage, isStrokeEndSample, packStrokeEndSample, unpackStrokeEndSample } from './strokeEndSample.js'
import type { Dab, StrokeOperation } from './stroke.js'

const dab: Dab = { x: 1, y: 2, pressure: 1, tiltX: 0, tiltY: 0, size: 24, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
const bytes = (text: string) => Uint8Array.from(atob(text.split(':')[1]), c => c.charCodeAt(0))
const packed = (raw: Uint8Array) => '5:' + btoa(String.fromCharCode(...raw))

describe('author elapsed time codec', () => {
  it('preserves v1 through v4 layouts and reads each historical version', () => {
    const inputs = [[dab], [{ ...dab, normalizedSpeed: 0 }], [{ ...dab, sourceSize: 24, sourceScale: 1 }], [{ ...dab, sourceAngle: Math.PI / 2 }]]
    for (const [i, input] of inputs.entries()) {
      const encoded = packDabs(input)
      expect(encoded.startsWith((i + 1) + ':')).toBe(true)
      expect(bytes(encoded).length).toBe([40, 44, 52, 60][i])
      expect(packDabs(unpackDabs(encoded))).toBe(encoded)
    }
  })
  it('keeps exact fractional timestamps on both sides of a periodic discontinuity', () => {
    const sourceTime = 1469.99999
    const restored = unpackDabs(packDabs([{ ...dab, t: sourceTime, sourceTime }]))[0]
    expect(restored.t).toBe(1470)
    expect(restored.sourceTime).toBe(sourceTime)
    expect((restored.t % 1470) / 1470).toBe(0)
    expect((restored.sourceTime! % 1470) / 1470).toBeGreaterThan(.9999999)
  })
  it.each([0, -0, Number.MIN_VALUE, 1470, 1469.99999, Number.MAX_SAFE_INTEGER])('preserves exact finite source time %s', sourceTime => {
    const input = { ...dab, sourceTime, sourceAngle: Math.PI / 2 }
    const encoded = packDabs([dab, input])
    expect(bytes(encoded).length).toBe(2 * 68)
    const [absent, restored] = unpackDabs(encoded)
    expect(absent.sourceTime).toBeUndefined()
    expect(Object.is(restored.sourceTime, sourceTime)).toBe(true)
    expect(restored.sourceAngle).toBe(Math.PI / 2)
    expect(packDabs([absent, restored])).toBe(encoded)
  })
  it.each([-1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid plain/packed/endpoint time %s', sourceTime => {
    expect(() => packDabs([{ ...dab, sourceTime }])).toThrow(/source time/)
    expect(() => strokeDabs({ dabs: [{ ...dab, sourceTime }] } as StrokeOperation)).toThrow(/source time/)
    expect(isStrokeEndSample({ ...dab, baseSize: 24, sourceTime })).toBe(false)
  })
  it('rejects corrupt fields and truncation before returning any prefix', () => {
    const input = packDabs([{ ...dab, sourceTime: 1 }])
    for (const invalid of [NaN, -Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
      const raw = bytes(input)
      new DataView(raw.buffer).setFloat64(60, invalid, true)
      expect(() => unpackDabs(packed(raw))).toThrow(/source time/)
    }
    const raw = bytes(input)
    expect(() => unpackDabs(packed(raw.slice(0, -1)))).toThrow(/multiple of 68/)
    new DataView(raw.buffer).setFloat64(60, Infinity, true)
    expect(unpackDabs(packed(raw))[0].sourceTime).toBeUndefined()
  })
  it('normalizes new time-only plain inputs to opaque storage before JSON persistence', () => {
    const sample = { ...dab, baseSize: 24, sourceTime: 1469.99999 }
    const op: StrokeOperation = { id: 'time', userId: 'user', timestamp: 0, type: 'stroke', layerId: 'ink', tool: 'digitalBrush', preset: 'brush:test@1', color: [0, 0, 0], strokeId: 'gesture', strokeEnd: true, dabs: [sample], strokeEndSample: sample }
    const canonical = canonicalStrokeStorage(op)
    expect(canonical.type).toBe('stroke')
    if (canonical.type !== 'stroke') throw Error('Expected stroke')
    expect(canonical.dabs).toBeUndefined()
    expect(canonical.strokeEndSample).toBeUndefined()
    expect(canonical.strokeEndSamplePacked).toBe(packStrokeEndSample(sample))
    expect(unpackStrokeEndSample(canonical.strokeEndSamplePacked!).sourceTime).toBe(sample.sourceTime)
    expect(strokeDabs(JSON.parse(JSON.stringify(canonical)))[0].sourceTime).toBe(sample.sourceTime)
  })
})
