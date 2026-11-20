import { expect, it } from 'vitest'
import { strokeDabs, type BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke } from './testing/engineTestUtils'

const descriptor: BrushDescriptor = {
  ...digitalBrushFromPreset('hard-round'), id: 'imported-aaaa1111bbbb2222cccc3333', version: 99,
  spacing: .00001, sizeByPressure: [[0, 1], [1, 1]], pressureSmoothingPx: 0,
  behavior: { version: 2, spacing: { mode: 'kritaAuto', coefficient: 2 } },
}

it('latches auto spacing for new pointer strokes and leaves recorded operations untouched', async () => {
  installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own auto spacing fixture', source: 'qa', warnings: [], descriptor }], assets: [], skipped: [] })
  const { engine } = createTestEngine({ userId: 'spacing-author' }, { width: 128, height: 48 })
  const { engine: replay } = createTestEngine({ userId: 'spacing-peer' }, { width: 128, height: 48 })
  try {
    for (const target of [engine, replay]) {
      target.appendOperation(makeLayerAdd('spacing-author', 'ink'))
      target.setActiveLayer('ink')
      target.setCompositeOrder([{ id: 'ink', opacity: 1 }])
      await paperReady(target)
    }
    engine.setTool('digitalBrush'); engine.setPencil(`brush:${descriptor.id}@99`); engine.setSize(20)
    simulateStroke(engine, Array.from({ length: 11 }, (_, i) => ({ x: 8 + i * 10, y: 24 })), { pressure: 1 })
    const recorded = engine.getOperations().find(op => op.type === 'stroke')
    if (!recorded || recorded.type !== 'stroke') throw new Error('Missing recorded stroke')
    const dabs = strokeDabs(recorded)
    expect(dabs.length).toBeGreaterThan(5)
    expect(dabs.length).toBeLessThan(20)
    const expected = 2 * Math.sqrt(dabs[0].size)
    for (let i = 1; i < dabs.length - 1; i++) expect(dabs[i].x - dabs[i - 1].x).toBeCloseTo(expected, 3)
    const frozen = structuredClone(dabs)
    replay.appendOperation(recorded, 'remote')
    const replayed = replay.getOperations().find(op => op.type === 'stroke')
    if (!replayed || replayed.type !== 'stroke') throw new Error('Missing replayed stroke')
    expect(strokeDabs(replayed)).toEqual(frozen)
    expect(strokeDabs(recorded)).toEqual(frozen)

    // A subsequent built-in tool must not inherit the imported source law.
    engine.setTool('pencil')
    simulateStroke(engine, [{ x: 8, y: 32 }, { x: 108, y: 32 }], { pressure: 1 })
    const strokes = engine.getOperations().filter(op => op.type === 'stroke')
    expect(strokes).toHaveLength(2)
    expect(strokeDabs(strokes[1]).length).toBeGreaterThan(dabs.length)
  } finally { engine.destroy(); replay.destroy() }
})
