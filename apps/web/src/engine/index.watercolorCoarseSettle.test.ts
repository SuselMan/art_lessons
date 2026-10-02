import { afterEach, expect, it, vi } from 'vitest'

import { createTestEngine, makeLayerAdd, paperReady, simulateStroke } from './testing/engineTestUtils'

// A final asynchronous watercolor composite writes after the live frame has
// already folded its fine tiles. The next zoomed-out frame must fold again.
afterEach(() => vi.restoreAllMocks())
it('refreshes the coarse level when an asynchronous watercolor settle lands', async () => {
  const { engine } = createTestEngine({ userId: 'author', infinite: true }, { width: 96, height: 96 })
  try {
    engine.appendOperation(makeLayerAdd('author', 'L'))
    engine.setActiveLayer('L')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    engine.setTool('watercolor')
    engine.setPencil('normal:55:60:PB29:round')
    engine.setSize(24)
    await paperReady(engine)
    simulateStroke(engine, [{ x: 16, y: 32 }, { x: 32, y: 40 }, { x: 48, y: 32 }])
    const internal = engine as unknown as {
      _settle: unknown; _display(): void; _completeSettle(): void;
      _downsampleTileInto(...args: unknown[]): void;
    }
    expect(internal._settle).toBeTruthy()
    const fold = vi.spyOn(internal, '_downsampleTileInto')
    engine.setInfiniteCamera(32, 32, 0.32, 0)
    internal._display()
    expect(fold).toHaveBeenCalled()
    fold.mockClear()
    internal._completeSettle()
    expect(internal._settle).toBeNull()
    internal._display()
    expect(fold).toHaveBeenCalled()
  } finally { engine.destroy() }
})
