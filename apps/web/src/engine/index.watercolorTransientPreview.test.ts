import { describe, expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, paperReady, simulatePredictedSamples, simulateStrokeEnd, simulateStrokeMove, simulateStrokeStart } from './testing/engineTestUtils'

describe('watercolor unsupported transient previews (#728)', () => {
  async function setup(tool: 'watercolor' | 'pencil' | 'eraser', previews = true) {
    const { engine } = createTestEngine({ userId: 'a', liveTipSegment: previews, predictPointer: previews }, { width: 64, height: 64 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('a', 'L'))
    engine.setActiveLayer('L')
    engine.setTool(tool)
    if (tool === 'watercolor') engine.setPencil('normal:100:100:PB29:round')
    engine.setSize(8)
    return engine
  }

  it('does not allocate or schedule empty watercolor tip/prediction frames', async () => {
    const engine = await setup('watercolor')
    simulateStrokeStart(engine, 8, 8)
    expect(engine['_tipBuf']).toBeNull()
    expect(engine['_previewBuf']).toBeNull()
    const schedule = vi.spyOn(engine as never, '_scheduleDisplay' as never)
    // A duplicate point produces no canonical dabs; there is no tip to refresh.
    simulateStrokeMove(engine, 8, 8)
    expect(schedule).not.toHaveBeenCalled()
    schedule.mockClear()
    simulatePredictedSamples(engine, [{ x: 12, y: 8 }, { x: 16, y: 8 }])
    expect(schedule).not.toHaveBeenCalled()
    expect(engine['_liveTip']).toBe(true)
    engine.destroy()
  })

  it('keeps physical final dabs identical with preview options enabled or disabled', async () => {
    const tapes = []
    for (const previews of [false, true]) {
      const engine = await setup('watercolor', previews)
      simulateStrokeStart(engine, 8, 8)
      simulateStrokeMove(engine, 20, 10)
      simulateStrokeMove(engine, 35, 18)
      simulatePredictedSamples(engine, [{ x: 45, y: 20 }, { x: 50, y: 25 }])
      simulateStrokeEnd(engine, 40, 22)
      tapes.push(engine.getOperations().filter(op => op.type === 'stroke').map(op => op.dabs))
      engine.destroy()
    }
    expect(tapes[0].length).toBeGreaterThan(0)
    expect(tapes[1]).toEqual(tapes[0])
  })

  it.each(['pencil', 'eraser'] as const)('preserves %s tip and prediction buffers', async tool => {
    const engine = await setup(tool)
    simulateStrokeStart(engine, 8, 8)
    expect(engine['_tipBuf']).not.toBeNull()
    expect(engine['_previewBuf']).not.toBeNull()
    const tip = vi.spyOn(engine as never, '_refreshTip' as never)
    simulateStrokeMove(engine, 20, 8)
    expect(tip).toHaveBeenCalled()
    const clear = vi.spyOn(engine['_previewBuf']!, 'clear')
    simulatePredictedSamples(engine, [{ x: 25, y: 8 }, { x: 30, y: 8 }])
    expect(clear).toHaveBeenCalledOnce()
    engine.destroy()
  })
})
