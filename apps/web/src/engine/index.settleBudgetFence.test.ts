import { describe, expect, it, vi } from 'vitest'
import { createTestEngine, dab, makeStroke } from './testing/engineTestUtils'

describe('Engine GPU budget fence capability (#728)', () => {
  it('keeps disabled finish path byte-for-byte in behavior and allocates no fence', () => {
    const { engine } = createTestEngine()
    const gl = engine['gl']
    const finish = vi.spyOn(gl, 'finish'), texture = vi.spyOn(gl, 'createTexture')
    engine['_settleQueue']['ctx'].syncGpu!(); engine['_settleQueue']['ctx'].syncGpu!()
    expect(finish).toHaveBeenCalledTimes(2)
    expect(texture).not.toHaveBeenCalled()
    expect(engine['_gpuBudgetFence']).toBeNull()
    engine.destroy()
  })
  it('fences only Queue and leaves drawing finish unchanged', () => {
    const { engine } = createTestEngine()
    const gl = engine['gl'], get = gl.getParameter.bind(gl)
    vi.spyOn(gl, 'getParameter').mockImplementation(p => p === gl.ACTIVE_TEXTURE ? gl.TEXTURE0 : p === gl.PACK_ALIGNMENT ? 4 : get(p))
    engine['_wcSettleBudgetFence'] = true
    const reads = vi.spyOn(gl, 'readPixels'), finish = vi.spyOn(gl, 'finish')
    engine['_settleQueue']['ctx'].syncGpu!()
    expect(reads).toHaveBeenCalledOnce()
    engine['_sliceLimits'].size = 1; engine['_sliceLimits'].budgetMs = 0
    const work = (function* (): Generator<number, undefined, void> { yield 64; return undefined })()
    engine['_runSlice'](work)
    expect(reads).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalled()
    work.return(undefined); engine.destroy()
  })

  it.each(['cancel', 'context-loss'] as const)('retains exactly owned fence lifetime through actual Engine %s', action => {
    const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
    const gl = engine['gl']
    engine.initLayer('L')
    engine['_wcSettleBudgetFence'] = true
    engine['_minmaxExt'] = { MAX_EXT: 0x8008 }
    engine['_sliceLimits'].size = 1; engine['_sliceLimits'].budgetMs = 0
    const originalGet = gl.getParameter.bind(gl)
    vi.spyOn(gl, 'getParameter').mockImplementation(p => p === gl.ACTIVE_TEXTURE ? gl.TEXTURE0 : p === gl.PACK_ALIGNMENT ? 4 : originalGet(p))
    const reads = vi.spyOn(gl, 'readPixels'), deletes = vi.spyOn(gl, 'deleteTexture')
    const op = makeStroke('remote', 'L', [dab(20, 24, { size: 12 })], { tool: 'watercolor', preset: 'normal:100:100:PB29:round', strokeId: 'fence', washId: 'fence', wet: '0' })
    engine['_paintOpOverFrames'](engine['_layers'].get('L')!, op, op.dabs!)
    expect(engine['_settle']).not.toBeNull()
    engine['_settleQueue']['ctx'].syncGpu!()
    const fence = engine['_gpuBudgetFence']!, texture = fence['texture']
    expect(texture).not.toBeNull()
    expect(reads.mock.calls.some(c => c[2] === 1 && c[3] === 1)).toBe(true)
    if (action === 'cancel') {
      engine['_cancelSettle']()
      expect(engine['_gpuBudgetFence']).toBe(fence)
      expect(fence['texture']).toBe(texture)
    } else {
      engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
      expect(fence['texture']).toBeNull()
      expect(deletes.mock.calls.filter(c => c[0] === texture)).toHaveLength(0)
      engine['_handleContextRestored']()
      engine['_settleQueue']['ctx'].syncGpu!()
      expect(fence['texture']).not.toBeNull()
      expect(fence['texture']).not.toBe(texture)
    }
    engine.destroy()
    expect(engine['_gpuBudgetFence']).toBeNull()
    if (action === 'cancel') expect(deletes.mock.calls.filter(c => c[0] === texture)).toHaveLength(1)
  })
})
