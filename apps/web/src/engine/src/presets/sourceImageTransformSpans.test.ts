import { expect, it } from 'vitest'
import native from './fixtures/sourceImageTransformSpans.native.json'
import history from '../raster/affineImageSpan16.full-qt-fixtures.json'
import { affineSpan16Straight, sampleAffineImageSpan16 } from '../raster/affineImageSpan16'
import type { InverseImageAffine } from '../raster/affineImageSpan'
import { sourceImageTransformSpans, type SourceImageAffine } from './sourceImageTransformSpans'

it('matches actual Qt aliased transformed-image coverage without recorded-span inputs', () => {
  const failures: unknown[] = []
  for (const [i, c] of native.cases.entries()) {
    const actual = sourceImageTransformSpans(c.sourceWidth, c.sourceHeight, c.width, c.height, c.forward as unknown as SourceImageAffine)
    if (JSON.stringify(actual) !== JSON.stringify(c.spans)) failures.push({ i, kind: [c.matrixType, c.uniform], actual, expected: c.spans })
  }
  expect(failures.slice(0, 3)).toEqual([])
  expect(failures).toHaveLength(0)
})

it('reuses the existing affine16 math to match whole native dabs without opaque-probe span lookup', () => {
  for (const [index, c] of history.cases.entries()) {
    const reference = native.cases[index]!
    const spans = sourceImageTransformSpans(c.levelWidth, c.levelHeight, c.width, c.height, reference.forward as unknown as SourceImageAffine)
    const rgba = new Uint8Array(c.width * c.height * 4)
    for (const span of spans) rgba.set(affineSpan16Straight(sampleAffineImageSpan16(
      Uint8Array.from(c.levelPremul), c.levelWidth, c.levelHeight, c.inverse as unknown as InverseImageAffine,
      span.x, span.y, span.length)), (span.y * c.width + span.x) * 4)
    expect([...rgba], `full native case ${index}`).toEqual(c.rgba)
  }
})

it('retains the before-fix AABB witness: span partition affects decode/store grouping', () => {
  const c = history.cases[11]!, source = Uint8Array.from(c.levelPremul)
  const aabb = new Uint8Array(c.width * c.height * 4)
  for (let y = 0; y < c.height; y++) aabb.set(affineSpan16Straight(sampleAffineImageSpan16(
    source, c.levelWidth, c.levelHeight, c.inverse as unknown as InverseImageAffine, 0, y, c.width)), y * c.width * 4)
  expect(aabb.reduce((sum, v, i) => sum + Number(v !== c.rgba[i]), 0)).toBe(3)
})

it('rejects invalid byte/allocation domains before planning any scanlines', () => {
  for (const n of [0, -1, .5, NaN, Infinity, 4097]) expect(() => sourceImageTransformSpans(n, 1, 1, 1, [1, 0, 0, 1, 0, 0])).toThrow()
  expect(() => sourceImageTransformSpans(1, 1, 2048, 2048, [1, 0, 0, 1, 0, 0])).toThrow()
  expect(() => sourceImageTransformSpans(1, 1, 1, 1, [1, 0, 0, 1, NaN, 0])).toThrow()
  expect(() => sourceImageTransformSpans(1, 1, 1, 1, [1, 0, 0, 1, 20000, 0])).toThrow()
})
