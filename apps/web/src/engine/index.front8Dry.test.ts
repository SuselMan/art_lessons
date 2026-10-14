import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'

describe('room paper_dry acceptance', () => {
  for (const model of ['front8-v1', 'front8-fine-v1'] as const) it(`${model}: starts Dry before earlier work and stops at the ordered Dry entry`, () => {
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
