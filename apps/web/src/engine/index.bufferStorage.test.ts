import { ownedBrushFixture } from './testing/ownedBrushFixture'
import { expect, it } from 'vitest'
import { PencilEngine } from './index'
import { snapshotAccumStorage } from './src/buffers/ContextStorageOwner'
import { createTestEngine } from './testing/engineTestUtils'
import { AccumulationBuffer } from './src/buffers/AccumulationBuffer'

it('reports context buffer storage and forgets old charges across actual engine restore', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 16, height: 16 })
  const gl = engine['gl'], stale = new AccumulationBuffer(gl, 8, 8)
  try {
    const before = AccumulationBuffer.contextStorageByteLength(gl)
    expect(before).toBeGreaterThan(256)
    expect(engine.getWatercolorPerf().bufferStorageMB).toBe(before / 1024 / 1024)
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0)
    engine['_handleContextRestored']()
    const restored = AccumulationBuffer.contextStorageByteLength(gl)
    expect(restored).toBeGreaterThan(0)
    stale.destroy()
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(restored)
    expect(engine.getWatercolorPerf().bufferStorageMB).toBe(restored / 1024 / 1024)
  } finally { stale.destroy(); engine.destroy() }
  expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0)
})

it('releases the paper screen cache when a healthy engine is retired', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 16, height: 16 })
  const gl = engine['gl']
  engine['_display']()
  expect(engine['_screenCache']).not.toBeNull()
  engine.destroy()
  expect(engine['_screenCache']).toBeNull()
  expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0)
})

it('retiring an engine preserves another live owner in the same context', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 16, height: 16 })
  const gl = engine['gl'], otherOwner = new AccumulationBuffer(gl, 8, 4)
  try {
    engine['_display']()
    engine.destroy()
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(128)
  } finally { otherOwner.destroy(); engine.destroy() }
  expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0)
})

it('attributes two real painter caches without counting buffer/pool storage twice across loss and destroy', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 16, height: 16 })
  const brush = engine['_brush']['textures'], smudge = engine['_smudge']['wetTextures']
  const mb = 1024 * 1024, gl = engine['gl']
  try {
    brush.protect(['brush']); brush.putOwned('brush',ownedBrushFixture(gl,32))
    smudge.protect(['smudge']); smudge.putOwned('smudge',ownedBrushFixture(gl,48))
    const before = AccumulationBuffer.contextStorageByteLength(gl)
    const perf = engine.getWatercolorPerf()
    expect(perf.rawBrushCacheChargeMB).toBe(80 / mb)
    expect(perf.knownTrackedStorageMB).toBe((before + 80) / mb)
    expect(perf.knownStorageComplete).toBe(false)
    expect(perf.storageContextLost).toBe(false)
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(brush.bytes).toBe(32) // stale names remain until restore; diagnostic excludes them
    expect(engine.getWatercolorPerf().rawBrushCacheChargeMB).toBe(0)
    expect(engine.getWatercolorPerf().knownTrackedStorageMB).toBe(0)
    expect(engine.getWatercolorPerf().storageContextLost).toBe(true)
    engine['_handleContextRestored']()
    expect(engine.getWatercolorPerf().rawBrushCacheChargeMB).toBe(0)
    expect(engine.getWatercolorPerf().knownTrackedStorageMB).toBe(AccumulationBuffer.contextStorageByteLength(gl) / mb)
  } finally { engine.destroy() }
  expect(engine.getWatercolorPerf().knownTrackedStorageMB).toBe(0)
})

it('two actual engines sharing one context retain distinct allocations through healthy retirement', () => {
  const { engine: first, canvas } = createTestEngine({ paper: 'flat' }, { width: 16, height: 16 })
  const gl = first['gl'], before = snapshotAccumStorage(gl).residentBytes
  const second = new PencilEngine(canvas as unknown as HTMLCanvasElement, { paper: 'flat' })
  try {
    const both = snapshotAccumStorage(gl).residentBytes
    expect(both).toBeGreaterThan(before)
    expect(snapshotAccumStorage(gl)).toMatchObject({ complete: false, reservedBytes: 0, limitBytes: Infinity })
    first.destroy()
    const remaining = snapshotAccumStorage(gl).residentBytes
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThan(both)
    second.destroy()
    expect(snapshotAccumStorage(gl).residentBytes).toBe(0)
  } finally { first.destroy(); second.destroy() }
})
