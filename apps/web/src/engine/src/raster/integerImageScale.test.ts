import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import oracle from './fixtures/integerImageScale.qt51513.json'
import { scaleIntegerImageU8 } from './integerImageScale'

it.each(oracle.cases)('matches actual Qt5.15.13 PRE-QPainter bytes: $id $direction', fixture => {
  const input = Uint8Array.from(fixture.sourceBytes)
  const before = input.slice()
  const channels = fixture.sourceChannels === 1 ? 1 : 4
  const actual = scaleIntegerImageU8(input,
    { width: fixture.sourceWidth, height: fixture.sourceHeight },
    { width: fixture.targetWidth, height: fixture.targetHeight }, channels)
  const expected = channels === 1
    ? fixture.outputBytesRGBA.filter((_value, index) => index % 4 === 0)
    : fixture.outputBytesRGBA
  expect([...actual]).toEqual(expected) // Exact oracle bytes, no area-filter tolerance.
  expect(input).toEqual(before)
  expect(actual).not.toBe(input)
})

it('does not confuse native grayscale brightness with coverage inversion', () => {
  const differing = oracle.cases.filter(fixture => fixture.sourceChannels === 1).filter(fixture => {
    const output = scaleIntegerImageU8(Uint8Array.from(fixture.sourceBytes, value => 255 - value),
      { width: fixture.sourceWidth, height: fixture.sourceHeight },
      { width: fixture.targetWidth, height: fixture.targetHeight })
    const expectedCoverage = fixture.outputBytesRGBA.filter((_value, index) => index % 4 === 0).map(value => 255 - value)
    return output.some((value, index) => value !== expectedCoverage[index])
  })
  // Truncation makes filtering then inversion observably different from
  // filtering a previously inverted mask. The caller must choose explicitly.
  expect(differing.length).toBeGreaterThan(0)
})

it('uses unsigned-safe arithmetic for bright full-weight two-axis reductions', () => {
  expect([...scaleIntegerImageU8(new Uint8Array(63).fill(255), { width: 9, height: 7 }, { width: 2, height: 2 })])
    .toEqual([255, 255, 255, 255])
})

it('rejects malformed layouts, invalid grids and excessive preparation work', () => {
  for (const width of [0, -1, .5, NaN, Infinity, 4097]) {
    expect(() => scaleIntegerImageU8(new Uint8Array(1), { width, height: 1 }, { width: 1, height: 1 })).toThrow(RangeError)
  }
  expect(() => scaleIntegerImageU8(new Uint8Array(3), { width: 2, height: 2 }, { width: 1, height: 1 })).toThrow(RangeError)
  expect(() => scaleIntegerImageU8(new Uint8Array(1), { width: 1, height: 1 }, { width: 4096, height: 4096 })).toThrow(RangeError)
  expect(() => scaleIntegerImageU8(new Uint8Array(4096 * 2 * 4), { width: 4096, height: 2 }, { width: 2, height: 4096 }, 4)).toThrow(RangeError)
})


it('returns an independent identity image even for a Uint8Array subclass with view-like slice', () => {
  const source = Buffer.from([13, 77])
  const output = scaleIntegerImageU8(source, { width: 2, height: 1 }, { width: 2, height: 1 })
  source[0] = 255
  expect([...output]).toEqual([13, 77])
})

it('preserves the Qt SIMD Y-before-X truncation order rather than interchangeable bilinear passes', () => {
  const fixture = oracle.cases[3]
  expect(fixture.id).toBe('Grayscale8-3')
  const transpose = (bytes: Uint8Array, width: number, height: number) => {
    const output = new Uint8Array(bytes.length)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) output[x * height + y] = bytes[y * width + x]
    return output
  }
  const wrongOrder = transpose(scaleIntegerImageU8(
    transpose(Uint8Array.from(fixture.sourceBytes), fixture.sourceWidth, fixture.sourceHeight),
    { width: fixture.sourceHeight, height: fixture.sourceWidth },
    { width: fixture.targetHeight, height: fixture.targetWidth }), fixture.targetHeight, fixture.targetWidth)
  const expected = fixture.outputBytesRGBA.filter((_value, index) => index % 4 === 0)
  expect([...wrongOrder]).not.toEqual(expected)
})
