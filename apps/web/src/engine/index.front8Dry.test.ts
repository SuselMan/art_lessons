import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'

describe('room paper_dry acceptance', () => {
  for (const model of ['front8-v1', 'front8-fine-v1', 'front8-fine-large-v1', 'front8-detail-v1', 'front8-detail-flow-v1', 'front8-detail-flow-v2'] as const) it(`${model}: starts Dry before earlier work and stops at the ordered Dry entry`, () => {
    const { engine } = createTestEngine({ watercolorModel: model, asyncFinish: true, materialPresentation: true })
    const scheduler = engine['_wcDryWorkScheduler']!, fifo = engine['_wcCanonical']
    const start = vi.spyOn(scheduler, 'start'), stop = vi.spyOn(scheduler, 'stop')
    const order: string[] = []
    fifo.enqueue({ execute: function* () { order.push('older material'); yield 0 }, cancel: () => {} })
    engine.appendOperation({ id: 'dry-fixture', type: 'paper_dry', userId: 'user-a', timestamp: 1 })
    expect(start).toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(order).toEqual([])
    const advance = () => (fifo as unknown as { advance(): void }).advance()
    advance(); expect(order).toEqual(['older material'])
    advance(); expect(stop).toHaveBeenCalledOnce()
    engine.destroy()
  })
  it('does not allocate a task scheduler for legacy authoring', () => {
    const { engine } = createTestEngine({ asyncFinish: true })
    expect(engine['_wcDryWorkScheduler']).toBeNull()
    engine.destroy()
  })
})

describe('optional bounded GPU completion during Dry', () => {
  it('keeps a newer Dry active and drains its last incomplete group exactly once', () => {
    const { engine } = createTestEngine({ watercolorModel: 'front8-detail-flow-v1', asyncFinish: true, dryGpuFenceBatch: 8 })
    const gl = engine['gl'], read = vi.spyOn(gl, 'readPixels')
    const first = engine['_startDryWorkClock'](), second = engine['_startDryWorkClock']()
    try {
      for (let i = 0; i < 7; i++) engine['_syncContinuationGpu']()
      expect(read).not.toHaveBeenCalled()
      engine['_finishDryWorkClock'](first)
      expect(engine['_wcDryWorkScheduler']!.active).toBe(true)
      expect(read).not.toHaveBeenCalled()
      engine['_syncContinuationGpu']()
      expect(read).toHaveBeenCalledOnce()
      engine['_syncContinuationGpu']()
      engine['_finishDryWorkClock'](second)
      expect(read).toHaveBeenCalledTimes(2)
      expect(engine['_wcDryWorkScheduler']!.active).toBe(false)
      engine['_finishDryWorkClock'](second)
      expect(read).toHaveBeenCalledTimes(2)
    } finally { read.mockRestore(); engine.destroy() }
  })

  it('does not allocate/read a completion fence when pending Dry is aborted or context is lost', () => {
    const { engine } = createTestEngine({ watercolorModel: 'front8-detail-flow-v1', asyncFinish: true, dryGpuFenceBatch: 8 })
    const read = vi.spyOn(engine['gl'], 'readPixels')
    try {
      engine['_startDryWorkClock']()
      for (let i = 0; i < 7; i++) engine['_syncContinuationGpu']()
      engine['_wcDryWorkScheduler']!.stop()
      expect(read).not.toHaveBeenCalled()
      expect(engine['_continuationGpuFence']).toBeNull()
      engine['_startDryWorkClock']()
      engine['_contextLost'] = true
      engine['_syncContinuationGpu']()
      expect(read).not.toHaveBeenCalled()
      expect(engine['_continuationGpuFence']).toBeNull()
    } finally { engine['_contextLost'] = false; read.mockRestore(); engine.destroy() }
  })
})
