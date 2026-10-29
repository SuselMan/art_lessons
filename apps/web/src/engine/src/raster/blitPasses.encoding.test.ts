import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { BlitPasses } from './blitPasses'
import { translationMatrix } from './matrix'

it.each(['transform', 'areaTransform'] as const)('selects per-tap conversion from immutable buffer encoding for %s without stale PM state', method => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const straight = new AccumulationBuffer(gl, 2, 2, 'nearest', 'straight-rgba8'), pm = new AccumulationBuffer(gl, 2, 2), dest = new AccumulationBuffer(gl, 2, 2)
  const quad = gl.createBuffer()!, mask = gl.createTexture()!, passes = new BlitPasses(gl, quad)
  const uniform = vi.spyOn(mock, 'uniform1f'), upload = vi.spyOn(mock, 'texImage2D')
  const draw = (source: AccumulationBuffer) => method === 'transform'
    ? passes.transform(source, translationMatrix(0, 0), 2, 2, dest.fbo)
    : passes.areaTransform(source, 0, 0, translationMatrix(0, 0), { tex: mask, rect: { minX: 0, minY: 0, maxX: 2, maxY: 2 } }, 2, 2, dest.fbo, 'over')
  try {
    draw(straight); draw(pm)
    expect(uniform.mock.calls.filter(([loc]) => (loc as unknown as { name: string }).name === 'u_sourceStraight').map(([, n]) => n)).toEqual([1, 0])
    expect(mock.getMinFilter(straight.texture)).toBe(mock.NEAREST)
    expect(mock.getMinFilter(pm.texture)).toBe(mock.LINEAR)
    expect(upload).not.toHaveBeenCalled()
  } finally { passes.destroy(); straight.destroy(); pm.destroy(); dest.destroy(); gl.deleteTexture(mask); gl.deleteBuffer(quad) }
})
it.each(['transform', 'areaTransform'] as const)('restores point sampling and blend lifetime when %s fails', method => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const source = new AccumulationBuffer(gl, 2, 2), dest = new AccumulationBuffer(gl, 2, 2)
  const quad = gl.createBuffer()!, mask = gl.createTexture()!, passes = new BlitPasses(gl, quad)
  try {
    const framebuffer = vi.spyOn(mock, 'bindFramebuffer')
    vi.spyOn(mock, 'drawArrays').mockImplementation(() => { throw new Error('injected draw failure') })
    expect(() => method === 'transform'
      ? passes.transform(source, translationMatrix(0, 0), 2, 2, dest.fbo)
      : passes.areaTransform(source, 0, 0, translationMatrix(0, 0), { tex: mask, rect: { minX: 0, minY: 0, maxX: 2, maxY: 2 } }, 2, 2, dest.fbo, 'over')).toThrow('injected draw failure')
    expect(mock.getMinFilter(source.texture)).toBe(mock.LINEAR)
    expect(mock.isEnabled(mock.BLEND)).toBe(false)
    expect(framebuffer).toHaveBeenLastCalledWith(mock.FRAMEBUFFER, null)
  } finally { passes.destroy(); source.destroy(); dest.destroy(); gl.deleteTexture(mask); gl.deleteBuffer(quad) }
})
