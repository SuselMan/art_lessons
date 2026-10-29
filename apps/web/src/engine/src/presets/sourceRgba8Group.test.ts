import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceRgba8Group/buffer.native.json'
import { applyRgba8AlphaMask, compositeRgba8 } from './sourceColorRgba8'
import { renderRgba8Group, type Rgba8MaskParticle, type Rgba8GroupLimits, type Rgba8Bounds, type StraightRgba8Surface } from './sourceRgba8Group'
import type { Rgba8 } from './mixWeightedRgba8'

const hex = (s: string): Uint8Array => Uint8Array.from(s.match(/../g) ?? [], byte => Number.parseInt(byte, 16))
const limits: Rgba8GroupLimits = { maximumBytes: 1024 * 1024, maximumParticles: 8, maximumWorkPixels: 1024 * 1024 }
const tuple = (v: readonly number[]): Rgba8 => [v[0], v[1], v[2], v[3]]
interface AuthoredParticle extends Rgba8Bounds {
  opacity: number
  material: { kind: string; color?: readonly number[]; pixelsHex?: string; alphaOverride?: number }
  coverageHex?: string
}
function particle(p: AuthoredParticle): Rgba8MaskParticle {
  return { x: p.x, y: p.y, width: p.width, height: p.height, opacity: p.opacity,
    material: p.material.kind === 'solid' ? { kind: 'solid', color: tuple(p.material.color!), alphaOverride: p.material.alphaOverride }
      : { kind: 'pixels', pixels: hex(p.material.pixelsHex!), alphaOverride: p.material.alphaOverride },
    coverage: p.coverageHex === undefined ? undefined : hex(p.coverageHex) }
}
const empty = (): StraightRgba8Surface => ({ x: 0, y: 0, width: 1, height: 1, pixels: new Uint8Array(4) })
const one: Rgba8MaskParticle = { x: 0, y: 0, width: 1, height: 1, material: { kind: 'solid', color: [128, 64, 32, 1] }, opacity: .5, coverage: new Uint8Array([128]) }

describe('straight RGBA8 masked material groups — explicit scalar header profile', () => {
  it('matches every native U8 alpha/mask combination without touching RGB', () => {
    expect(fixture.maskTableHex).toHaveLength(65536 * 2)
    const expected = hex(fixture.maskTableHex), errors: number[] = []
    for (let alpha = 0; alpha < 256; alpha++) for (let mask = 0; mask < 256; mask++) {
      const result = applyRgba8AlphaMask([128, 64, 32, alpha], mask)
      if (result[0] !== 128 || result[1] !== 64 || result[2] !== 32 || result[3] !== expected[alpha * 256 + mask]) errors.push(alpha * 256 + mask)
    }
    expect(errors).toEqual([])
  })
  for (const row of fixture.cases) it(`whole native buffers ${row.name}`, () => {
    const destination = { ...row.destination, pixels: hex(row.destination.pixelsHex) }
    const original = destination.pixels.slice(), particles = row.particles.map(particle)
    const outer = { ...row.outer, mode: row.outer.mode as 'over' | 'add' | 'alphaDarken' }
    const groupBounds = 'groupBounds' in row ? row.groupBounds as Rgba8Bounds : undefined
    const result = renderRgba8Group(destination, particles, outer, limits, groupBounds)
    const [x, y, width, height] = row.expected.groupBounds
    expect(result.group).toEqual({ x, y, width, height, pixels: hex(row.expected.groupHex) })
    expect(result.output).toEqual({ x: row.destination.x, y: row.destination.y, width: row.destination.width, height: row.destination.height, pixels: hex(row.expected.outputHex) })
    expect(destination.pixels).toEqual(original)
    expect(result.output.pixels.buffer).not.toBe(destination.pixels.buffer)
    for (let i = 0; i < particles.length; i++) {
      const prefix = renderRgba8Group(destination, particles.slice(0, i + 1), outer, limits, { x, y, width, height })
      expect(prefix.group.pixels).toEqual(hex(row.expected.trace[i].groupHex))
    }
  })
  it('stores alpha-mask first and never premultiplies the alpha1 material/group', () => {
    const result = renderRgba8Group(empty(), [one], { mode: 'over', opacity: 1 }, limits)
    expect([...result.group.pixels]).toEqual([128, 64, 32, 1])
    expect([...result.output.pixels]).toEqual([128, 64, 32, 1])
    expect(compositeRgba8([128, 64, 32, 1], [0, 0, 0, 0], { mode: 'over', opacity: .5, mask: 128 })).toEqual([0, 0, 0, 0])
    expect(Math.round(Math.round(128 / 255) * 255)).toBe(255) // forbidden premul8 roundtrip
  })
  it('expresses the native foreground-fill alpha reset as an explicit material operation', () => {
    const outputs = [0, 1, 128, 255].map(alpha => renderRgba8Group(empty(), [{ ...one, material: { kind: 'solid', color: [128, 64, 32, alpha], alphaOverride: 255 } }], { mode: 'over', opacity: 1 }, limits).group.pixels)
    for (const output of outputs) expect([...output]).toEqual([128, 64, 32, 64])
    const native = fixture.cases.find(c => c.name === 'qt-coverage-input-0')!
    const before = hex(native.expected.trace[0].beforeMaskHex)
    expect(native.particles[0].material.color![3]).toBe(0)
    for (let i = 3; i < before.length; i += 4) expect(before[i]).toBe(255)
  })
  it('handles zero-area finite bounds without iterating huge empty axes', () => {
    const destination = { x: 0, y: 0, width: 0, height: Number.MAX_SAFE_INTEGER, pixels: new Uint8Array(0) }
    const p = { ...one, width: 0, height: Number.MAX_SAFE_INTEGER, coverage: new Uint8Array(0) }
    const result = renderRgba8Group(destination, [p], { mode: 'over', opacity: 1 }, { maximumBytes: 0, maximumParticles: 1, maximumWorkPixels: 0 })
    expect(result.group.pixels).toHaveLength(0); expect(result.output.pixels).toHaveLength(0)
  })
  it('validates every input before allocating either output buffer, including invisible/outside material', () => {
    const destination = empty(), original = destination.pixels.slice()
    const badCases: readonly Rgba8MaskParticle[][] = [
      [one, { ...one, x: 100, opacity: 0, material: { kind: 'solid', color: [1.5, 2, 3, 4] } }],
      [one, { ...one, x: 100, opacity: 0, coverage: new Uint8Array(0) }],
      [one, { ...one, material: { kind: 'pixels', pixels: new Uint8Array(3) } }],
      [one, { ...one, material: { kind: 'solid', color: [0, 0, 0, 0], alphaOverride: NaN } }],
      [one, { ...one, x: Infinity }],
      [one, { ...one, x: Number.MAX_SAFE_INTEGER }],
    ]
    const NativeArray = globalThis.Uint8Array
    let allocations = 0
    const observed = new Proxy(NativeArray, { construct(target, args) { allocations++; return Reflect.construct(target, args) } })
    Object.defineProperty(globalThis, 'Uint8Array', { value: observed, configurable: true, writable: true })
    try {
      for (const bad of badCases) expect(() => renderRgba8Group(destination, bad, { mode: 'over', opacity: 1 }, limits)).toThrow()
      expect(() => renderRgba8Group(destination, [one], { mode: 'over', opacity: NaN }, limits)).toThrow()
      expect(() => renderRgba8Group(destination, [one], { mode: 'over', opacity: 1 }, { ...limits, maximumBytes: 7 })).toThrow('byte budget')
      expect(() => renderRgba8Group(destination, [one], { mode: 'over', opacity: 1 }, { ...limits, maximumWorkPixels: 1 })).toThrow('work budget')
      expect(() => renderRgba8Group(destination, [one], { mode: 'over', opacity: 1 }, limits, { x: 2, y: 2, width: 1, height: 1 })).toThrow('contain')
      expect(allocations).toBe(0)
    } finally {
      Object.defineProperty(globalThis, 'Uint8Array', { value: NativeArray, configurable: true, writable: true })
    }
    expect(destination.pixels).toEqual(original)
  })
})
