import { expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'
import { RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'
import type { AccumulationBuffer } from './src/buffers/AccumulationBuffer'

it('defers only a hidden Dry display composite and retains the mandatory boundary flush', () => {
  const { engine } = createTestEngine()
  engine.initLayer('L')
  const target = engine['_layers'].get('L')!
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'])
  vi.spyOn(scratch, 'live', 'get').mockReturnValue(true)
  vi.spyOn(scratch, 'finishContext', 'get').mockReturnValue({ target } as NonNullable<typeof scratch.finishContext>)
  const hidden = vi.spyOn(engine as unknown as { _materialPresentationHides(id: string): boolean }, '_materialPresentationHides').mockReturnValue(true)
  const owners = engine['_wcMaterialOwners']
  const keys = vi.spyOn(owners.layers, 'keys').mockImplementation(() => new Map([['L', null]]).keys())
  const scheduler = engine['_wcDryWorkScheduler']
  // The fixture's ordinary engine has no Dry scheduler: use the real optional
  // scheduler from a review engine rather than changing the default contract.
  const review = createTestEngine({ watercolorModel: 'front8-detail-flow-v2', watercolorReview: true, asyncFinish: true, materialPresentation: true }).engine
  engine['_wcDryWorkScheduler'] = review['_wcDryWorkScheduler']
  const ticket = engine['_startDryWorkClock']()
  const key = {} as AccumulationBuffer
  const arm = () => {
    scratch.pendingComposite.set(key, { tile: {} as Parameters<typeof scratch.pendingComposite.set>[1]['tile'], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } })
    engine['_liveComposite'] = { scratch, profile: {materialModel: 'legacy'} } as NonNullable<typeof engine['_liveComposite']>
  }
  try {
    arm(); engine['_flushLiveComposite'](true)
    expect(scratch.pendingComposite.size).toBe(1)
    engine['_flushLiveComposite']()
    expect(scratch.pendingComposite.size).toBe(0)
    arm(); hidden.mockReturnValue(false); engine['_flushLiveComposite'](true)
    expect(scratch.pendingComposite.size).toBe(0)
    arm(); hidden.mockReturnValue(true); engine['_wcDryWorkScheduler']?.stop(ticket); engine['_flushLiveComposite'](true)
    expect(scratch.pendingComposite.size).toBe(0)
  } finally {
    keys.mockRestore(); hidden.mockRestore(); engine['_wcDryWorkScheduler'] = scheduler
    scratch.destroy(); engine.destroy(); review.destroy()
  }
})
