import { expect, it } from 'vitest'
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
