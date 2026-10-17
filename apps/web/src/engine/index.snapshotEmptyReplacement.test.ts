import { expect, it } from 'vitest'
import {
  createTestEngine,
  makeStroke,
  dab,
  readTilePixels,
} from './testing/engineTestUtils'
import type { SnapshotTile } from './src/oplog/snapshotCodec'
const opaque = (originX = 0): SnapshotTile => ({
  originX,
  originY: 0,
  width: 8,
  height: 8,
  pixels: new Uint8Array(256).fill(77),
})
for (const kind of ['absent', 'transparent'] as const)
  it(`an ${kind} replacement snapshot removes the previous bitmap checkpoint even after a later Undo`, () => {
    const { engine } = createTestEngine(
      { userId: 'A', pageWidth: 8, pageHeight: 8 },
      { width: 8, height: 8 },
    )
    engine.initLayer('L')
    try {
      engine.restoreLayerFromSnapshot('L', [opaque()], 5)
      expect(readTilePixels(engine, 'L', 0, 0, 8, 8)!.some((v) => v > 0)).toBe(
        true,
      )
      engine.restoreLayerFromSnapshot(
        'L',
        kind === 'absent' ? [] : [{ ...opaque(), pixels: new Uint8Array(256) }],
        8,
      )
      const blank = () => {
        const pixels = readTilePixels(engine, 'L', 0, 0, 8, 8)
        return pixels === null || pixels.every((v) => v === 0)
      }
      expect(blank()).toBe(true)
      engine.appendOperation(
        makeStroke('A', 'L', [dab(4, 4, { size: 4, opacity: 0.4 })], {
          seq: 9,
        }),
        'remote',
      )
      engine.undo()
      expect(blank()).toBe(true)
    } finally {
      engine.destroy()
    }
  })
it('a replacement snapshot removes omitted old tiles immediately and does not revive them after Undo', () => {
  const { engine } = createTestEngine(
    { userId: 'A', infinite: true },
    { width: 8, height: 8 },
  )
  engine.initLayer('L')
  try {
    engine.restoreLayerFromSnapshot('L', [opaque(), opaque(1024)], 5)
    expect(readTilePixels(engine, 'L', 1, 0)!.some((v) => v > 0)).toBe(true)
    engine.restoreLayerFromSnapshot('L', [opaque()], 8)
    const blank = () => {
      const pixels = readTilePixels(engine, 'L', 1, 0)
      return pixels === null || pixels.every((v) => v === 0)
    }
    expect(blank()).toBe(true)
    engine.appendOperation(
      makeStroke('A', 'L', [dab(1028, 4, { size: 4, opacity: 0.4 })], {
        seq: 9,
      }),
      'remote',
    )
    engine.undo()
    expect(blank()).toBe(true)
  } finally {
    engine.destroy()
  }
})
