import { describe, expect, it, vi } from 'vitest'
import { createTestEngine, fillStroke, makeLayerAdd } from './testing/engineTestUtils'
import type { ILayerBuffer } from './src/buffers/ILayerBuffer'
import type { SnapshotLedger } from './src/oplog/snapshotLedger'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'

function setup() {
  const { engine } = createTestEngine({ userId: 'a' }, { width: 8, height: 8 })
  const internal = engine as unknown as {
    gl: WebGLRenderingContext
    _snapshotIO: { ctx: { quiet: (id: string) => boolean; settled: (id: string) => boolean } }
    _handleContextRestored: () => void
    _layers: Map<string, ILayerBuffer>
    _snapshots: SnapshotLedger
  }
  engine.appendOperation(makeLayerAdd('a', 'A'), 'remote')
  // Keep a real resident transparent target, as drying a pure-water wash
  // does. layer_clear would remove it and would not exercise readback retries.
  const clear = () => {
    for (const target of internal._layers.get('A')!.allResident()) target.buffer.clear()
    internal._snapshots.markDirty('A')
  }
  engine.appendOperation(fillStroke('a', 'A', 4, 4, 6), 'remote')
  clear()
  const reads = vi.spyOn(internal.gl, 'readPixels')
  return { engine, internal, ledger: internal._snapshots, reads, clear }
}

describe('confirmed empty snapshot retries', () => {
  it('reads once, keeps dirty and does not claim publication or coverage', () => {
    const { engine, ledger, reads } = setup()
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    expect(reads.mock.calls.length).toBeGreaterThan(0)
    reads.mockClear()
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    expect(reads).not.toHaveBeenCalled()
    expect(engine.isLayerDirty('A')).toBe(true)
    expect(ledger.isCovered('A', 100)).toBe(false)
  })

  it('refusal is not cached; later paint is baked after an empty observation', () => {
    const { engine, ledger, reads } = setup()
    ledger.refusePublishing('A')
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    expect(reads).not.toHaveBeenCalled()
    ledger.allowPublishing('A')
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    expect(reads.mock.calls.length).toBeGreaterThan(0)
    reads.mockClear()
    engine.appendOperation(fillStroke('a', 'A', 4, 4, 6), 'remote')
    const bytes = engine.bakeNetworkSnapshot('A')
    expect(bytes).not.toBeNull()
    expect(reads.mock.calls.length).toBeGreaterThan(0)
    expect(decodeLayerTiles(bytes!, 0).tiles.length).toBeGreaterThan(0)
    expect(engine.isLayerDirty('A')).toBe(false)
  })

  it('rechecks guards and another empty mutation invalidates the observation', () => {
    const { engine, ledger, reads, clear } = setup()
    engine.bakeNetworkSnapshot('A')
    reads.mockClear()
    ledger.refusePublishing('A')
    clear()
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    expect(reads).not.toHaveBeenCalled()
    ledger.allowPublishing('A')
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    expect(reads.mock.calls.length).toBeGreaterThan(0)
  })

  it('restores real pixels into the same layer after an empty observation', () => {
    const { engine, internal, reads } = setup()
    const sameBuffer = internal._layers.get('A')
    engine.bakeNetworkSnapshot('A')
    const source = setup().engine
    source.appendOperation(fillStroke('a', 'A', 4, 4, 6), 'remote')
    const tiles = decodeLayerTiles(source.bakeNetworkSnapshot('A')!, 0).tiles
    engine.restoreLayerFromSnapshot('A', tiles, 100)
    expect(internal._layers.get('A')).toBe(sameBuffer)
    reads.mockClear()
    expect(engine.bakeNetworkSnapshot('A')).not.toBeNull()
    expect(reads.mock.calls.length).toBeGreaterThan(0)
  })

  it('does not suppress a different layer containing paint', () => {
    const { engine } = setup()
    engine.bakeNetworkSnapshot('A')
    engine.appendOperation(makeLayerAdd('a', 'B'), 'remote')
    engine.appendOperation(fillStroke('a', 'B', 4, 4, 6), 'remote')
    expect(engine.bakeNetworkSnapshot('B')).not.toBeNull()
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
  })
  it('rebuilds replacement buffers after context restore rather than reusing empty evidence', () => {
    const { engine, internal, reads } = setup()
    engine.bakeNetworkSnapshot('A')
    const old = internal._layers.get('A')
    // The accepted journal still contains the original paint. Context restore
    // must replay it even though the old GL target was observed empty.
    internal._handleContextRestored()
    expect(internal._layers.get('A')).not.toBe(old)
    reads.mockClear()
    expect(engine.bakeNetworkSnapshot('A')).not.toBeNull()
    expect(reads.mock.calls.length).toBeGreaterThan(0)
  })

  it('runs quiet and settling guards before consulting old empty evidence', () => {
    const { engine, internal, reads } = setup()
    engine.bakeNetworkSnapshot('A')
    reads.mockClear()
    const ctx = internal._snapshotIO.ctx
    const quiet = vi.spyOn(ctx, 'quiet').mockReturnValue(false)
    const original = ctx.settled
    const settled = vi.spyOn(ctx, 'settled')
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    expect(settled).not.toHaveBeenCalled()
    quiet.mockRestore()
    settled.mockRestore()
    const settleWithRepair = vi.spyOn(ctx, 'settled').mockImplementationOnce(id => {
      // Actual settle/repair is allowed to change pixels and dirty revision.
      const ready = original(id)
      engine.appendOperation(fillStroke('a', 'A', 4, 4, 6), 'remote')
      return ready
    })
    expect(engine.bakeNetworkSnapshot('A')).not.toBeNull()
    expect(settleWithRepair).toHaveBeenCalledOnce()
    expect(reads.mock.calls.length).toBeGreaterThan(0)
  })

  it('real clear and repaint remain publishable after observing empty pixels', () => {
    const { engine } = setup()
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    engine.appendOperation({ id: 'clear-again', type: 'layer_clear', userId: 'a', timestamp: 0, layerId: 'A' }, 'remote')
    expect(engine.bakeNetworkSnapshot('A')).toBeNull()
    engine.appendOperation(fillStroke('a', 'A', 4, 4, 6), 'remote')
    expect(engine.bakeNetworkSnapshot('A')).not.toBeNull()
  })

})
