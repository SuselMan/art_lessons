import { expect, it } from 'vitest'
import native from './fixtures/sourceImageTransform.native.json'
import { sourceImageTransformPlan } from './sourceImageTransformPlan'
import { sourcePngCharacteristicSize } from './sourcePngGeometry'

it('matches continuous native Brush::characteristicSize before hotspot/ceil/tiny clamping', () => {
  for (const c of native.characteristicCases) expect(sourcePngCharacteristicSize(c.brush, c.shape)).toEqual(c.expected)
  expect(native.characteristicCases[0]!.expected.every(v => v < 1)).toBe(true)
})

it('matches actual complete pinned pyramid transform matrices, selection, origin and translation workaround', () => {
  const failures: unknown[] = []
  for (const [index, c] of native.cases.entries()) {
    const plan = sourceImageTransformPlan(c.width, c.height, c.shape, c.subX, c.subY)
    const { spans: _spans, ...actual } = plan
    const { rgba: _rgba, levelRGBA: _levelRGBA, ...expected } = c.expected
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) failures.push({ index, key, actual: actual[key], expected: expected[key] })
    }
  }
  expect(failures.slice(0, 1)).toEqual([])
  expect(failures).toHaveLength(0)
})
