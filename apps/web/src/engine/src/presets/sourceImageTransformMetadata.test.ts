import { expect, it, vi } from 'vitest'
import native from './fixtures/sourceImageTransform.native.json'
vi.mock('./sourceImageTransformSpans', () => ({ sourceImageTransformSpans: vi.fn(() => { throw new Error('row enumeration forbidden before admission') }) }))
import { sourceImageTransformMetadata, sourceImageTransformPlan } from './sourceImageTransformPlan'

it('validates all native image metadata before any covered-row enumeration', () => {
  for (const c of native.cases) {
    const actual = sourceImageTransformMetadata(c.width, c.height, c.shape, c.subX, c.subY)
    expect(actual).not.toHaveProperty('spans')
    const { rgba: _rgba, mask: _mask, levelRGBA: _level, ...expected } = c.expected
    // Native fixture JSON does not preserve signed-zero bits; retain the
    // existing native metadata comparison contract rather than rewriting math.
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) expect(JSON.stringify(actual[key])).toBe(JSON.stringify(expected[key]))
  }
  const c = native.cases.find(c => !sourceImageTransformMetadata(c.width, c.height, c.shape, c.subX, c.subY).directCopy)!
  expect(() => sourceImageTransformPlan(c.width, c.height, c.shape, c.subX, c.subY)).toThrow('row enumeration forbidden')
})
