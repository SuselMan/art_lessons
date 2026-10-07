import { expect, it } from 'vitest'
import { ribbonScratchAdmission } from './ribbonScratchAdmission'

it('does not admit eight A4 fine planes beyond the existing64MiB free ceiling', () => {
  const bytes = 1536 * 1536 * 4
  expect(ribbonScratchAdmission(1536, 1536, 8, 0, 0)).toBe(7)
  expect(ribbonScratchAdmission(1536, 1536, 8, 4, 4 * bytes)).toBe(3)
  expect(ribbonScratchAdmission(1536, 1536, 8, 2, 60 * 1024 * 1024)).toBe(0)
})
it('counts other sizes, rejects unknown/corrupt metadata, and never shrinks or evicts live buffers', () => {
  expect(ribbonScratchAdmission(1024, 1024, 8, 0, 48 * 1024 * 1024)).toBe(4)
  expect(ribbonScratchAdmission(1024, 1024, 2, 4, 16 * 1024 * 1024)).toBe(0)
  expect(ribbonScratchAdmission(1024, 1024, 8, 4, 0)).toBe(0)
  for (const bad of [NaN, Infinity, -1, 1.5]) expect(ribbonScratchAdmission(bad, 1024, 8, 0, 0)).toBe(0)
  expect(ribbonScratchAdmission(Number.MAX_SAFE_INTEGER, 2, 8, 0, 0)).toBe(0)
})
