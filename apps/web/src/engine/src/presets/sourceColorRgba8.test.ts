import { describe, expect, it } from 'vitest'
import fixture from './fixtures/sourceColorRgba8/scalar.native.json'
import { adjustHslCompatibilityRgba8, setRgba8Opacity, compositeRgba8, compositeRgba8Group, type Rgba8CompositeControl } from './sourceColorRgba8'
import type { Rgba8 } from './mixWeightedRgba8'

const pixel = (p: readonly number[]): Rgba8 => [p[0], p[1], p[2], p[3]]
const modes = ['over', 'add', 'alphaDarken'] as const

describe('compatibility HSL and alpha byte setters (actual scalar native methods)', () => {
  for (const [i, row] of fixture.hsl.entries()) it(`native byte color ${i}`, () => {
    expect(adjustHslCompatibilityRgba8(pixel(row.input), row.adjust[0], row.adjust[1], row.adjust[2])).toEqual(row.expected)
    expect(setRgba8Opacity(pixel(row.expected), row.opacity)).toEqual(row.alpha)
  })
  it('preserves alpha while adjusting HSL, and replaces rather than multiplies random alpha', () => {
    expect(adjustHslCompatibilityRgba8([255, 0, 0, 79], 1, 0, 0)).toEqual([0, 255, 255, 79])
    expect(setRgba8Opacity([10, 20, 30, 17], .5)).toEqual([10, 20, 30, 128])
    expect(setRgba8Opacity([10, 20, 30, 0], 1)).toEqual([10, 20, 30, 255])
  })
  it('leaves immutable input pixels unchanged', () => {
    const input = Object.freeze([201, 49, 71, 155] as const)
    const out = adjustHslCompatibilityRgba8(input, .2, -.1, .3)
    expect(input).toEqual([201, 49, 71, 155]); expect(out).not.toBe(input)
  })
})

describe('scalar byte compositing, all RGBA channels enabled', () => {
  for (const [i, row] of fixture.composite.entries()) it(`native ${modes[row.mode]} ${i}`, () => {
    expect(compositeRgba8(pixel(row.src), pixel(row.dst), { mode: modes[row.mode], mask: row.mask < 0 ? undefined : row.mask, opacity: row.opacity, flow: row.flow, averageOpacity: row.average })).toEqual(row.expected)
  })
  for (const [i, row] of fixture.groups.entries()) it(`native local Over + single outer group ${i}`, () => {
    const particles = row.particles.map(p => ({ color: pixel(p.color), opacity: p.opacity, mask: p.mask }))
    const outer = { mode: modes[row.outer.mode], opacity: row.outer.opacity, mask: 255, flow: row.outer.flow, averageOpacity: row.outer.average }
    expect(compositeRgba8Group(pixel(row.destination), particles, outer)).toEqual({ group: row.group, output: row.expected })
    let current = pixel(row.foreground)
    for (const p of row.particles) {
      if (p.freshColor) {
        current = row.family === 1 ? pixel(row.foreground) : adjustHslCompatibilityRgba8(pixel(row.foreground), p.adjust[0], p.adjust[1], p.adjust[2])
        if (p.randomAlpha >= 0) current = setRgba8Opacity(current, p.randomAlpha)
      }
      expect(current).toEqual(p.color)
    }
  })
  it('models the two random-opacity factors and one group transfer, not per-particle outer opacity', () => {
    const ink = setRgba8Opacity([255, 0, 0, 255], .5)
    const particles = [{ color: ink, opacity: .5 }, { color: ink, opacity: .5 }]
    const empty: Rgba8 = [0, 0, 0, 0], control = { mode: 'over', opacity: .5 } as const
    const grouped = compositeRgba8Group(empty, particles, control)
    expect(grouped.group).toEqual([255, 0, 0, 112])
    expect(grouped.output).toEqual([255, 0, 0, 56])
    const wronglyTransferredEach = particles.reduce<Rgba8>((dst, p) => compositeRgba8(compositeRgba8(p.color, empty, { mode: 'over', opacity: p.opacity }), dst, control), empty)
    expect(wronglyTransferredEach[3]).toBe(60)
    expect(grouped.output).not.toEqual(wronglyTransferredEach)
  })
  it('rejects malformed input and over-budget groups', () => {
    const p: Rgba8 = [1, 2, 3, 4]
    for (const opacity of [NaN, -1, Infinity, 1.1]) expect(() => compositeRgba8(p, p, { mode: 'over', opacity })).toThrow()
    expect(() => adjustHslCompatibilityRgba8(p, NaN, 0, 0)).toThrow()
    expect(() => setRgba8Opacity([1, 2, 3, 1.5], 1)).toThrow()
    expect(() => compositeRgba8(p, p, { mode: 'over', opacity: 1, mask: 256 })).toThrow()
    expect(() => compositeRgba8Group(p, Array.from({ length: 65536 }, () => ({ color: p, opacity: 1 })), { mode: 'over', opacity: 1 })).toThrow('budget')
    expect(() => compositeRgba8(p, p, { mode: 'bad', opacity: 1 } as unknown as Rgba8CompositeControl)).toThrow()
  })
})
