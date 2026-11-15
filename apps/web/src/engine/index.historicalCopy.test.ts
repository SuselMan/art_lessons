import { afterEach, describe, expect, it } from 'vitest'
import {
  createTestEngine, fillStroke, makeLayerAdd, makeLayerDuplicate, makeLayerMerge, readLayerPixels,
} from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'

const engines: ReturnType<typeof createTestEngine>['engine'][] = []
afterEach(() => { for (const engine of engines.splice(0)) engine.destroy() })
function setup() {
  const { engine } = createTestEngine({ userId: 'A' }, { width: 16, height: 16 })
  engines.push(engine)
  return engine
}

describe('historical copy source', () => {
  it('does not seed an old copy from a newer source snapshot', () => {
    const engine = setup()
    engine.appendOperation(makeLayerAdd('A', 'source'), 'remote')
    engine.appendOperation(fillStroke('A', 'source', 4, 4, 3), 'remote')
    engine.appendOperation(makeLayerDuplicate('B', 'copy', 'source'), 'remote')
    const copied = readLayerPixels(engine, 'copy')!
    engine.appendOperation(fillStroke('A', 'source', 12, 12, 3), 'remote')
    engine.restoreLayerFromSnapshot('source', [{
      originX: 0, originY: 0, width: 16, height: 16,
      pixels: readLayerPixels(engine, 'source')!,
    }], 3)

    const replay = engine.bakeLayerByFullReplay('copy')!
    expect(replay).not.toBeNull()
    expect(decodeLayerTiles(replay, 0).tiles[0].pixels).toEqual(copied)
  })

  it('keeps live and replay copies equal after the source author undoes their earlier stroke', () => {
    const engine = setup()
    engine.appendOperation(makeLayerAdd('A', 'source'), 'remote')
    engine.appendOperation(fillStroke('A', 'source', 6, 6, 4), 'remote')
    engine.appendOperation(makeLayerDuplicate('B', 'copy', 'source'), 'remote')
    const copied = readLayerPixels(engine, 'copy')!
    expect(copied.some(value => value !== 0)).toBe(true)

    expect(engine.undo()?.type).toBe('stroke')
    expect(readLayerPixels(engine, 'copy')).toEqual(copied)
    const replay = engine.bakeLayerByFullReplay('copy')!
    expect(replay).not.toBeNull()
    const tiles = decodeLayerTiles(replay, 0).tiles
    expect(tiles).toHaveLength(1)
    expect(tiles[0].pixels).toEqual(copied)
  })
})

for (const kind of ['duplicate', 'merge'] as const) {
  describe(`historical ${kind}`, () => {
    const copy = (engine: ReturnType<typeof setup>, target = 'copy', source = 'source') => {
      engine.appendOperation(kind === 'duplicate'
        ? makeLayerDuplicate('B', target, source)
        : makeLayerMerge('B', target, [{ id: source, opacity: 1 }]), 'remote')
    }
    function replayPixels(engine: ReturnType<typeof setup>, layer: string) {
      const data = engine.bakeLayerByFullReplay(layer)
      return data ? decodeLayerTiles(data, 0).tiles[0]?.pixels : null
    }
    it('keeps the copied prefix through source Undo, Redo and branch removal', () => {
      const engine = setup()
      engine.appendOperation(makeLayerAdd('A', 'source'), 'remote')
      const a = fillStroke('A', 'source', 4, 4, 3)
      const b = { ...fillStroke('A', 'source', 12, 12, 3), strokeId: a.strokeId }
      engine.appendOperation(a, 'remote'); engine.appendOperation(b, 'remote')
      copy(engine)
      const expected = readLayerPixels(engine, 'copy')!
      for (const type of ['operation_undo', 'operation_redo', 'operation_undo'] as const) {
        engine.appendOperation({ id: `${type}-${engine.getOperations().length}`, type,
          userId: 'A', timestamp: 20, targetOpId: b.id }, 'remote')
        expect(replayPixels(engine, 'copy')).toEqual(expected)
      }
      engine.appendOperation(fillStroke('A', 'other', 8, 8, 2), 'remote')
      expect(replayPixels(engine, 'copy')).toEqual(expected)
      expect(readLayerPixels(engine, 'copy')).toEqual(expected)
    })
    it('does not restore paint undone before the copy when Redo arrives later', () => {
      const engine = setup()
      engine.appendOperation(makeLayerAdd('A', 'source'), 'remote')
      const a = fillStroke('A', 'source', 4, 4, 3)
      engine.appendOperation(a, 'remote')
      engine.appendOperation({ id: 'undo', type: 'operation_undo', userId: 'A', timestamp: 3, targetOpId: a.id }, 'remote')
      copy(engine)
      engine.appendOperation({ id: 'redo', type: 'operation_redo', userId: 'A', timestamp: 5, targetOpId: a.id }, 'remote')
      expect(replayPixels(engine, 'copy')).toBeNull()
    })
    it('recursively preserves the first copy when an intermediate copy gets later paint', () => {
      const engine = setup()
      engine.appendOperation(makeLayerAdd('A', 'source'), 'remote')
      const a = fillStroke('A', 'source', 4, 4, 3)
      engine.appendOperation(a, 'remote'); copy(engine)
      copy(engine, 'nested', 'copy')
      const expected = readLayerPixels(engine, 'nested')!
      engine.appendOperation(fillStroke('B', 'copy', 12, 12, 3), 'remote')
      engine.appendOperation({ id: 'undo', type: 'operation_undo', userId: 'A', timestamp: 8, targetOpId: a.id }, 'remote')
      expect(replayPixels(engine, 'nested')).toEqual(expected)
      expect(readLayerPixels(engine, 'nested')).toEqual(expected)
    })
  })
}
