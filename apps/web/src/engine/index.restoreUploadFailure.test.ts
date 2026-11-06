import { expect, it } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'

it.each([0x0505, 0x0502])('refuses a snapshot upload with GL error %i, retaining the audit until a valid retry', errorCode => {
  const { engine, canvas } = createTestEngine({ userId: 'A' }, { width: 8, height: 8 })
  engine.setBaseLayers(['L'])
  const tile = { originX: 0, originY: 0, width: 8, height: 8, pixels: new Uint8Array(256).fill(200) }
  const gl = canvas.getContext('webgl') as unknown as { getError(): number }
  const original = gl.getError.bind(gl)
  let calls = 0
  gl.getError = () => ++calls === 2 ? errorCode : original()
  try {
    expect(() => engine.restoreLayerFromSnapshot('L', [tile], 100)).toThrow(/Snapshot upload failed/)
    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
    expect(engine['_snapshots'].hasCoverage('L')).toBe(false)
    expect(engine['_checkpoints'].hasSnapshotFor('L')).toBe(false)
    expect(engine.isLayerDirty('L')).toBe(true)
    expect(engine.takeSnapshotRestoreAudit()).toMatchObject([{ layerId: 'L', glError: errorCode }])
    expect(engine.takeSnapshotRestoreAudit()).toEqual([])
    gl.getError = original
    engine.restoreLayerFromSnapshot('L', [tile], 100)
    expect(engine['_snapshots'].hasCoverage('L')).toBe(true)
    expect(engine.bakeNetworkSnapshot('L')).not.toBeNull()
    expect(engine.takeSnapshotRestoreAudit()).toMatchObject([{ layerId: 'L', glError: 0 }])
  } finally { gl.getError = original; engine.destroy() }
})

it('does not advance existing coverage or replace a valid checkpoint with a failed newer upload', () => {
  const { engine, canvas } = createTestEngine({ userId: 'A' }, { width: 8, height: 8 })
  engine.setBaseLayers(['L'])
  const tile = { originX: 0, originY: 0, width: 8, height: 8, pixels: new Uint8Array(256).fill(200) }
  const gl = canvas.getContext('webgl') as unknown as { getError(): number }
  const original = gl.getError.bind(gl)
  try {
    engine.restoreLayerFromSnapshot('L', [tile], 100)
    engine.takeSnapshotRestoreAudit()
    const checkpoint = engine['_checkpoints'].all().find(cp => cp.layerId === 'L' && cp.fromSnapshot)
    let calls = 0
    gl.getError = () => ++calls === 2 ? 0x0505 : original()
    expect(() => engine.restoreLayerFromSnapshot('L', [tile], 200)).toThrow(/Snapshot upload failed/)
    expect(engine['_snapshots'].isCovered('L', 150)).toBe(false)
    expect(engine['_checkpoints'].all().find(cp => cp.layerId === 'L' && cp.fromSnapshot)).toBe(checkpoint)
    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
    gl.getError = original
    engine.restoreLayerFromSnapshot('L', [tile], 200)
    expect(engine['_snapshots'].isCovered('L', 150)).toBe(true)
    expect(engine.bakeNetworkSnapshot('L')).not.toBeNull()
  } finally { gl.getError = original; engine.destroy() }
})
