import { afterEach, expect, it, vi } from 'vitest'
import { watercolorModelQaOptions } from './watercolorModelQa'
afterEach(() => vi.unstubAllEnvs())
it('keeps B as default and records the derived film only for its explicit QA entry', () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_QA_WATERCOLOR_MODEL', 'front8-fine-v1')
  expect(watercolorModelQaOptions(false).watercolorModel).toBe('front8-fine-v1')
  expect(watercolorModelQaOptions(false, '?qaFastDry=compact').watercolorModel).toBe('front8-detail-flow-v2')
  const film = watercolorModelQaOptions(false, '?qaFastDry=film')
  expect(film.watercolorModel).toBe('front8-detail-flow-v3')
  expect(film.dryGpuFenceBatch).toBe(8)
  expect(film.materialPresentation).toBe(true)
  vi.stubEnv('DEV', false)
  expect(watercolorModelQaOptions(false, '?qaFastDry=film').watercolorModel).toBe('legacy')
})
