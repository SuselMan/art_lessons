import { expect, it } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { bindCanonicalLayerTargets } from './CanonicalLayerTargets'

it('binds actual straight tile handles to one validated batch lifetime, and rejects stale re-acquisition', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const layer = new TiledLayerBuffer(gl, 4, 4, undefined, undefined, undefined, 'straight-rgba8')
  const input = layer.resolveForPaint({ minX: -1, minY: -1, maxX: 1, maxY: 1 })
  const bound = bindCanonicalLayerTargets(layer, input)
  expect(bound).toHaveLength(4)
  for (let i = 0; i < bound.length; i++) {
    expect(bound[i].texture).toBe(input[i].buffer.texture)
    expect(bound[i].framebuffer).toBe(input[i].buffer.fbo)
    expect(bound[i].originX).toBe(input[i].originX)
    expect(bound[i].originY).toBe(input[i].originY)
    expect(bound[i].lifetime).toBe(bound[0].lifetime)
  }
  const release = bound[0].lifetime.lease()
  expect(() => layer.clear()).toThrow('retained')
  release(); release()
  layer.clear()
  layer.resolveForPaint({ minX: -1, minY: -1, maxX: 1, maxY: 1 })
  expect(() => bound[0].lifetime.lease()).toThrow('stale')
  layer.destroy()
})
it('refuses PM storage and foreign tiles before creating a canonical binding', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const pm = new TiledLayerBuffer(gl, 4, 4)
  const a = new TiledLayerBuffer(gl, 4, 4, undefined, undefined, undefined, 'straight-rgba8')
  const b = new TiledLayerBuffer(gl, 4, 4, undefined, undefined, undefined, 'straight-rgba8')
  const rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  try {
    expect(() => bindCanonicalLayerTargets(pm, pm.resolveForPaint(rect))).toThrow('straight')
    expect(() => bindCanonicalLayerTargets(a, b.resolveForPaint(rect))).toThrow('Foreign')
    expect(() => a.clear()).not.toThrow()
  } finally { pm.destroy(); a.destroy(); b.destroy() }
})
