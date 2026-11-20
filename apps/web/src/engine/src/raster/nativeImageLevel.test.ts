import { expect, it } from 'vitest'
import oracle from './fixtures/nativeImageLevel.qt51513.json'
import { buildNativeImageLevel, selectNativeImageLevel } from './nativeImageLevel'

it('selects rounded native grids instead of POT/trilinear levels for actual source extents', () => {
  expect(selectNativeImageLevel({ width: 220, height: 220 }, 12)).toEqual({ scale: .0625, nativeWidth: 14, nativeHeight: 14 })
  expect(selectNativeImageLevel({ width: 220, height: 220 }, 48)).toEqual({ scale: .25, nativeWidth: 55, nativeHeight: 55 })
  expect(selectNativeImageLevel({ width: 112, height: 111 }, 48)).toEqual({ scale: .5, nativeWidth: 56, nativeHeight: 56 })
  expect(selectNativeImageLevel({ width: 112, height: 111 }, 160)).toEqual({ scale: 2, nativeWidth: 224, nativeHeight: 222 })
})

it('applies the absolute1e-6 scale boundary and QSize half-away positive rounding', () => {
  const source = { width: 111, height: 57 }
  expect(selectNativeImageLevel(source, 111 * (.5 + .5e-6))).toEqual({ scale: .5, nativeWidth: 56, nativeHeight: 29 })
  expect(selectNativeImageLevel(source, 111 * (.5 + 2e-6)).scale).toBe(1)
  expect(selectNativeImageLevel(source, 111 * (.5 - 2e-6)).scale).toBe(.5)
  expect(selectNativeImageLevel({ width: 1, height: 5 }, .000001)).toEqual({ scale: .5, nativeWidth: 1, nativeHeight: 3 })
})

it('caps enlargement at8 and uses either axis for the512 admission threshold', () => {
  expect(selectNativeImageLevel({ width: 64, height: 64 }, 10000).scale).toBe(8)
  expect(selectNativeImageLevel({ width: 65, height: 65 }, 10000).scale).toBe(4)
  expect(selectNativeImageLevel({ width: 257, height: 257 }, 10000).scale).toBe(1)
  expect(selectNativeImageLevel({ width: 1024, height: 1 }, 10000).scale).toBe(8)
})

it('filters recovered brightness before inversion and adds an exact zero-coverage border', () => {
  const coverage = Uint8Array.from([255, 0, 162, 125]) // Actual Qt grayscale oracle: [0,255,93,130].
  const before = coverage.slice()
  const output = buildNativeImageLevel(coverage, { width: 2, height: 2 }, 1)
  expect(output).toMatchObject({ scale: .5, nativeWidth: 1, nativeHeight: 1, width: 3, height: 3 })
  expect([...output.pixels]).toEqual([0, 0, 0, 0, 136, 0, 0, 0, 0])
  expect(coverage).toEqual(before)
})

it('builds exactly one bounded plane and rejects invalid source layout or oversized native enlargement', () => {
  expect(() => buildNativeImageLevel(new Uint8Array(2), { width: 2, height: 2 }, 2)).toThrow(RangeError)
  expect(() => buildNativeImageLevel(new Uint8Array(1024), { width: 1024, height: 1 }, 10000)).toThrow(RangeError)
  for (const extent of [0, -1, NaN, Infinity]) expect(() => selectNativeImageLevel({ width: 2, height: 2 }, extent)).toThrow(RangeError)
  expect(() => selectNativeImageLevel({ width: .5, height: 2 }, 1)).toThrow(RangeError)
})


it.each(oracle.cases)('matches exact authored Qt QSize/resize/border/coverage bytes: $id', fixture => {
  const source = Uint8Array.from(fixture.sourceGrayBytes, value => 255 - value)
  const output = buildNativeImageLevel(source,
    { width: fixture.sourceWidth, height: fixture.sourceHeight },
    Math.max(fixture.sourceWidth, fixture.sourceHeight) * fixture.requestedScale)
  expect(output).toMatchObject({
    scale: fixture.selectedScale, nativeWidth: fixture.nativeWidth, nativeHeight: fixture.nativeHeight,
    width: fixture.borderedWidth, height: fixture.borderedHeight,
  })
  expect([...output.pixels]).toEqual(fixture.borderedCoverage)
})
