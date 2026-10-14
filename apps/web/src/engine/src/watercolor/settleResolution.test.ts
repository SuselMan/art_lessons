import { expect, it } from 'vitest'
import { watercolorSettleScale } from './settleResolution'

it('preserves precise small edges and recorded native/coarse policies', () => {
  expect(watercolorSettleScale(12, 600, 'fine-large')).toBe(1)
  expect(watercolorSettleScale(12, 600, 'native')).toBe(1)
  expect(watercolorSettleScale(12, 600, 'coarse')).toBe(2)
  expect(watercolorSettleScale(128, 1024, 'native')).toBe(1)
  expect(watercolorSettleScale(128, 1024, 'fine-large')).toBe(2)
  for (const policy of ['native', 'coarse', 'fine-large'] as const)
    expect(watercolorSettleScale(128, 1025, policy)).toBe(2)
})
it('uses the recorded radius and window boundary, independent of pool or camera', () => {
  expect(watercolorSettleScale(47.99, 1024, 'fine-large')).toBe(1)
  expect(watercolorSettleScale(48, 512, 'fine-large')).toBe(1)
  expect(watercolorSettleScale(48, 513, 'fine-large')).toBe(2)
})
