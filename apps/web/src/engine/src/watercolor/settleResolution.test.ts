import { expect, it } from 'vitest'
import { watercolorSettleScale } from './settleResolution'

it('keeps small dry-paper marks at the legacy resolution in v2, including diagnostic callers', () => {
  for (const radius of [8, 28, 47]) {
    expect(watercolorSettleScale(radius, 760, 'front8-v1')).toBe(2)
    expect(watercolorSettleScale(radius, 760, 'front8-v2', true)).toBe(1)
    expect(watercolorSettleScale(radius, 760, 'legacy')).toBe(1)
  }
})

it('retains half-resolution work for large fields and the recorded v1 thresholds', () => {
  expect(watercolorSettleScale(48, 1024, 'front8-v2')).toBe(1)
  expect(watercolorSettleScale(48, 1025, 'front8-v2')).toBe(2)
  expect(watercolorSettleScale(7, 760, 'front8-v1')).toBe(1)
  expect(watercolorSettleScale(28, 128, 'front8-v1')).toBe(1)
  expect(watercolorSettleScale(28, 129, 'front8-v1')).toBe(2)
  expect(watercolorSettleScale(28, 760, 'legacy', true)).toBe(2)
})
