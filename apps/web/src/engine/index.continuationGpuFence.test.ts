import { describe, expect, it, vi } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { createTestEngine } from './testing/engineTestUtils'

function fixture() {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const gl = engine['gl'], original = gl.getParameter.bind(gl)
  vi.spyOn(gl, 'getParameter').mockImplementation(p => p === gl.ACTIVE_TEXTURE ? gl.TEXTURE0 : p === gl.PACK_ALIGNMENT ? 4 : original(p))
  return { engine, gl }
}
describe('canonical continuation completion clock', () => {
  it('preserves default finish and legacy Queue sync without a tiny allocation', () => {
    const { engine, gl } = fixture(), finish = vi.spyOn(gl, 'finish'), allocation = vi.spyOn(gl, 'createTexture')
    engine['_settleQueue']['ctx'].syncGpu!(); engine['_settleQueue']['ctx'].continuationSyncGpu!()
    expect(finish).toHaveBeenCalledTimes(2); expect(allocation).not.toHaveBeenCalled()
    expect(engine['_continuationGpuFence']).toBeNull(); engine.destroy()
  })
  it('uses one owned reusable four-byte read for continuation only', () => {
    const { engine, gl } = fixture(); engine['_wcContinuationGpuFence'] = true
    const reads = vi.spyOn(gl, 'readPixels'), finish = vi.spyOn(gl, 'finish'), textures = vi.spyOn(gl, 'createTexture')
    engine['_settleQueue']['ctx'].continuationSyncGpu!(); engine['_settleQueue']['ctx'].continuationSyncGpu!()
    engine['_settleQueue']['ctx'].syncGpu!()
    expect(textures).toHaveBeenCalledOnce(); expect(reads).toHaveBeenCalledTimes(2); expect(finish).toHaveBeenCalledOnce()
    expect(reads.mock.calls.every(c => c[2] === 1 && c[3] === 1 && (c[6] as Uint8Array).byteLength === 4)).toBe(true)
    engine.destroy(); expect(engine['_continuationGpuFence']).toBeNull()
  })
  it('retains resources on job cancellation and forgets names on actual context loss', () => {
    const { engine, gl } = fixture(); engine['_wcContinuationGpuFence'] = true; engine['_syncContinuationGpu']()
    const fence = engine['_continuationGpuFence']!, deletes = vi.spyOn(gl, 'deleteTexture')
    engine['_cancelSettle'](); expect(engine['_continuationGpuFence']).toBe(fence)
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(fence['texture']).toBeNull(); expect(deletes).not.toHaveBeenCalled()
    const reads = vi.spyOn(gl, 'readPixels'); engine['_syncContinuationGpu'](); expect(reads).not.toHaveBeenCalled()
    engine.destroy()
  })
  it('uses the actual completion clock in canonical drawing and leaves unrelated drawing unchanged', () => {
    const { engine, gl } = fixture(); engine['_wcContinuationGpuFence'] = true
    engine['_sliceLimits'].size = 1; engine['_sliceLimits'].budgetMs = 0
    const reads = vi.spyOn(gl, 'readPixels'), finish = vi.spyOn(gl, 'finish')
    function* paint(): Generator<number, ReadonlyMap<Dab, number> | undefined, void> { yield 1; return undefined }
    engine['_runSlice'](paint()); expect(reads).not.toHaveBeenCalled(); expect(finish).toHaveBeenCalledTimes(2)
    engine['_wcCanonical'].enqueue({ execute: function* () { yield 1 }, cancel() {} })
    finish.mockClear(); engine['_runSlice'](paint())
    expect(reads).toHaveBeenCalledTimes(2); expect(finish).not.toHaveBeenCalled(); engine.destroy()
  })
  it('uses the same scope during an actual canonical continuation loop', () => {
    const { engine, gl } = fixture(); engine['_wcContinuationGpuFence'] = true
    const reads = vi.spyOn(gl, 'readPixels'), events: number[] = []
    function* work(): Generator<number, void, void> { events.push(1); yield 1; events.push(2) }
    const result = engine['_advanceAsyncCanonical'](work(), () => true)
    expect(result.done).toBe(true); expect(events).toEqual([1, 2]); expect(reads).toHaveBeenCalledTimes(2); engine.destroy()
  })

  it('forgets old names during actual restoration and lazily creates new owners', () => {
    const { engine } = fixture(); engine['_wcContinuationGpuFence'] = true; engine['_syncContinuationGpu']()
    const fence = engine['_continuationGpuFence']!, oldTexture = fence['texture']
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    engine['_handleContextRestored'](); expect(fence['texture']).toBeNull()
    engine['_syncContinuationGpu'](); expect(fence['texture']).not.toBe(oldTexture); expect(fence['texture']).not.toBeNull()
    engine.destroy()
  })
  it('cleans partial allocation and surfaces its failure without silently changing the clock', () => {
    const { engine, gl } = fixture(); engine['_wcContinuationGpuFence'] = true
    const deletes = vi.spyOn(gl, 'deleteTexture'), finish = vi.spyOn(gl, 'finish')
    vi.spyOn(gl, 'checkFramebufferStatus').mockReturnValue(0)
    expect(() => engine['_syncContinuationGpu']()).toThrow('framebuffer incomplete')
    expect(deletes).toHaveBeenCalledOnce(); expect(finish).not.toHaveBeenCalled()
    expect(engine['_continuationGpuFence']!['texture']).toBeNull(); engine.destroy()
  })

  it('checks canonical drawing after each atomic yield without changing legacy adaptation', () => {
    const { engine, gl } = fixture(); engine['_wcContinuationGpuFence'] = true
    engine['_wcCanonical'].enqueue({ execute: function* () { yield 1 }, cancel() {} })
    const groups = engine['_sliceLimits']; groups.size = 16; groups.px = 1 << 20; groups.budgetMs = 0
    const initial = { size: groups.size, px: groups.px }, order: string[] = []
    const reads = vi.spyOn(gl, 'readPixels')
    function* atomic(): Generator<number, ReadonlyMap<Dab, number> | undefined, void> {
      order.push('C', 'P'); yield 1; order.push('nextC', 'nextP'); yield 1; return undefined
    }
    const work = atomic(), result = engine['_runSlice'](work)
    expect(result.done).toBe(false); expect(order).toEqual(['C', 'P']); expect(reads).toHaveBeenCalledTimes(2)
    expect({ size: groups.size, px: groups.px }).toEqual(initial)
    engine['_runSlice'](work); expect(order).toEqual(['C', 'P', 'nextC', 'nextP'])
    expect({ size: groups.size, px: groups.px }).toEqual(initial); engine.destroy()
  })

})

it('reports real canonical ownership and cancellation to the continuation gate', () => {
  const { engine } = fixture()
  const backlog = engine['_settleQueue']['ctx'].canonicalBacklogSize!
  expect(backlog()).toBe(0)
  engine['_wcCanonical'].enqueue({ execute: function* () { yield 1 }, cancel() {} })
  engine['_wcCanonical'].enqueue({ execute: function* () { yield 1 }, cancel() {} })
  expect(backlog()).toBe(2)
  engine['_wcCanonical'].cancel(false)
  expect(backlog()).toBe(0)
  engine.destroy()
})
