import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'
import { TiledLayerBuffer } from './TiledLayerBuffer'
import { COARSE_FACTORS } from './tileMath'

it('charges existing mip levels after invalidation and drops released storage', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const buffer = new AccumulationBuffer(gl, 8, 4)
  try {
    expect(buffer.storageByteLength).toBe(128)
    buffer.ensureMipmaps()
    expect(buffer.storageByteLength).toBe(128 + 32 + 8 + 4)
    buffer.clear()
    expect(buffer.storageByteLength).toBe(172)
    buffer.ensureMipmaps()
    expect(buffer.storageByteLength).toBe(172)
    const query = vi.spyOn(mock, 'getParameter')
    expect(buffer.storageByteLength).toBe(172); expect(query).not.toHaveBeenCalled()
  } finally { buffer.destroy() }
  expect(buffer.storageByteLength).toBe(0)
})

it('reports only existing fine and coarse allocations without flushing pending work', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, downsample = vi.fn()
  const layer = new TiledLayerBuffer(gl, 8, 8, undefined, undefined, downsample)
  const rect = { minX: 0, minY: 0, maxX: 8, maxY: 8 }
  try {
    expect(layer.gpuAllocationSnapshot()).toEqual([])
    const fine = layer.resolveForPaint(rect)[0].buffer
    expect(layer.gpuAllocationSnapshot().map(a => a.factor)).toEqual([1])
    expect(downsample).not.toHaveBeenCalled()
    for (const factor of COARSE_FACTORS) layer.resolveCoarse(rect, factor)
    const snapshot = layer.gpuAllocationSnapshot()
    expect(snapshot.map(a => a.factor)).toEqual([1, ...COARSE_FACTORS])
    expect(snapshot[0].buffer).toBe(fine)
    expect(snapshot.reduce((sum, a) => sum + a.bytes, 0)).toBe(256 * (1 + COARSE_FACTORS.length))
    expect(Object.isFrozen(snapshot)).toBe(true); expect(snapshot.every(Object.isFrozen)).toBe(true)
    downsample.mockClear()
    layer.resolveForPaint(rect) // New pyramid debt must remain pending.
    const allocate = vi.spyOn(mock, 'createTexture'), read = vi.spyOn(mock, 'readPixels')
    layer.gpuAllocationSnapshot(); layer.gpuAllocationSnapshot()
    expect(allocate).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(downsample).not.toHaveBeenCalled()
    layer.resolveCoarse(rect, COARSE_FACTORS[0])
    expect(downsample).toHaveBeenCalledTimes(1)
    layer.clear(); expect(layer.gpuAllocationSnapshot()).toEqual([])
  } finally { layer.destroy() }
})

it('does not recover evicted tiles or change the eviction order', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const rebuild = vi.fn(() => ({ readPixels: () => new Uint8Array(256), destroy: () => {} }))
  const layer = new TiledLayerBuffer(gl, 8, 8, rebuild, 1)
  try {
    for (let x = 0; x < 20; x++) layer.resolveForPaint({ minX: x * 8, minY: 0, maxX: x * 8 + 8, maxY: 8 })
    expect(layer.evictedTileCount).toBeGreaterThan(0)
    rebuild.mockClear()
    const count = layer.tileCount, evicted = layer.evictedTileCount
    const before = layer.gpuAllocationSnapshot()
    expect(layer.gpuAllocationSnapshot().map(a => a.buffer)).toEqual(before.map(a => a.buffer))
    expect(before).toHaveLength(count); expect(layer.evictedTileCount).toBe(evicted)
    expect(rebuild).not.toHaveBeenCalled()
  } finally { layer.destroy() }
})

it.each([[8, 8, 'straight-rgba8'], [3, 5, 'premultiplied-rgba8']] as const)('does not charge unsupported mip levels for %s x %s %s', (width, height, encoding) => {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const buffer = new AccumulationBuffer(gl, width, height, 'nearest', encoding)
  try {
    expect(buffer.ensureMipmaps()).toBe(false)
    expect(buffer.storageByteLength).toBe(width * height * 4)
  } finally { buffer.destroy() }
})
