import type { StrokeOperation } from '@grafetto/shared'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, dab, makeLayerAdd, makeStroke, readCompositePixels } from './testing/engineTestUtils'

/** Independent peers may have independent reveal timers, but they share one
 * screen. A 20-person burst must not submit one full composite per timer. */
describe('#697 concurrent peer reveals', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('paints 18 peers and presents their previews once per animation frame', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16))
    const applied: StrokeOperation[] = []
    const { engine } = createTestEngine({ userId: 'local', onPreviewApplied: op => applied.push(op) }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('local', 'L'))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    vi.advanceTimersByTime(32) // finish construction/layer display requests
    const display = vi.spyOn(engine as unknown as { _display(): void }, '_display')
    for (let i = 0; i < 18; i++) {
      engine.previewOperation(makeStroke(`peer-${i}`, 'L', [
        dab(8 + (i % 6) * 9, 8 + Math.floor(i / 6) * 18, { size: 8, t: 0 }),
        dab(8 + (i % 6) * 9, 8 + Math.floor(i / 6) * 18, { size: 8, t: 1000 }),
      ]))
    }
    vi.advanceTimersByTime(16)
    expect(display).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(display).toHaveBeenCalledTimes(1)
    const pixels = readCompositePixels(engine)
    for (let i = 0; i < 18; i++) {
      const x = 8 + (i % 6) * 9, y = 8 + Math.floor(i / 6) * 18
      expect(pixels[(y * 64 + x) * 4 + 3]).toBeGreaterThan(0)
    }
    vi.advanceTimersByTime(1100)
    expect(applied).toHaveLength(18)
    expect(new Set(applied.map(op => op.userId)).size).toBe(18)
    engine.destroy()
  })
})
