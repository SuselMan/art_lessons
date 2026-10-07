import { expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, makeStroke, dab } from './testing/engineTestUtils'

function fixture() {
  const { engine } = createTestEngine({ paper: 'flat', userId: 'artist' }, { width: 8, height: 8 })
  engine.appendOperation(makeLayerAdd('artist', 'L'), 'remote')
  engine.appendOperation(makeStroke('artist', 'L', [dab(4, 4, { size: 6, opacity: .5 })]), 'remote')
  engine['_wcAsyncFinish'] = true
  return engine
}
function fail(engine: ReturnType<typeof fixture>) {
  const error = new Error('canonical material interrupted')
  engine['_wcCanonical'].enqueue({ execute: function* () { yield 0; throw error }, cancel() {} })
  engine['_wcCanonical']['advance'](); engine['_wcCanonical']['advance']()
  expect(engine['_wcCanonical'].pending).toBe(false)
  expect(engine['_wcAsyncError']).toBe(error)
}
it('refuses network and undo checkpoints after a real FIFO failure even when no work remains', () => {
  const engine = fixture()
  expect(engine.bakeNetworkSnapshot('L')).not.toBeNull()
  const checkpoint = vi.spyOn(engine['_checkpoints'], 'add')
  engine['_takeCheckpoint']('L'); expect(checkpoint).toHaveBeenCalledOnce()
  checkpoint.mockClear(); fail(engine)
  expect(engine['_snapshotQuiet']('L')).toBe(false)
  expect(engine.bakeNetworkSnapshot('L')).toBeNull()
  engine['_takeCheckpoint']('L'); expect(checkpoint).not.toHaveBeenCalled()
  engine.destroy()
})
it('does not export or publish preview from an idle failed material pipeline', async () => {
  const engine = fixture(), blob = new Blob(['healthy'])
  const png = vi.spyOn(engine['_exporter'], 'exportPNG').mockResolvedValue(blob)
  const review = vi.spyOn(engine['_exporter'], 'exportReviewImage').mockResolvedValue(null)
  const preview = vi.spyOn(engine['_exporter'], 'bakePreview').mockResolvedValue(blob)
  expect(await engine.exportPNG()).toBe(blob)
  png.mockClear(); fail(engine)
  expect(await engine.exportPNG()).toBeNull()
  expect(await engine.exportReviewImage()).toBeNull()
  expect(await engine.bakePreview()).toBeNull()
  expect(png).not.toHaveBeenCalled(); expect(review).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled()
  engine.destroy()
})
