import { describe, expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { WatercolorPasses, type WatercolorPassesContext } from './WatercolorPasses'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'

function fixture() {
  const mock = new MockGL()
  const gl = mock as unknown as WebGLRenderingContext
  const passes = new WatercolorPasses({ gl: () => gl, screenBuf: () => gl.createBuffer()! } as WatercolorPassesContext)
  passes.initFieldPrograms(); passes.initFieldUniforms(); passes.initFieldAttributes()
  const buffer = { width: 1, height: 1, texture: gl.createTexture(), beginReplaceDraw() {}, endDraw() {} } as unknown as AccumulationBuffer
  const create = vi.spyOn(gl, 'createProgram')
  const remove = vi.spyOn(gl, 'deleteProgram')
  return { gl, passes, buffer, create, remove }
}

describe('zero face program ownership', () => {
  it('allocates nothing on OFF and lazily reuses separate P/C programs on ON', () => {
    const f = fixture()
    try {
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 15, .5)
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 16, .5, { independentZeroFaces: false })
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 1, .5, { independentZeroFaces: true })
      expect(f.create).not.toHaveBeenCalled()
      for (let i = 0; i < 2; i++) for (const mode of [15, 16] as const) {
        f.passes.fieldOp(f.buffer, f.buffer, f.buffer, mode, .5, { independentZeroFaces: true })
      }
      expect(f.create).toHaveBeenCalledTimes(2)
    } finally { f.passes.destroy() }
    const optional = f.create.mock.results.map(r => r.value)
    for (const program of optional) expect(f.remove.mock.calls.filter(c => c[0] === program)).toHaveLength(1)
  })
  it('forgets invalid old-context handles and creates new programs after restoration', () => {
    const f = fixture()
    f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 15, .5, { independentZeroFaces: true })
    const stale = f.create.mock.results[0].value
    Object.defineProperty(f.gl, 'isProgram', { configurable: true, value: (program: WebGLProgram) => program !== stale })
    f.passes.initFieldPrograms(); f.passes.initFieldUniforms(); f.passes.initFieldAttributes()
    expect(f.remove.mock.calls.some(c => c[0] === stale)).toBe(false)
    f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 15, .5, { independentZeroFaces: true })
    expect(f.create.mock.results.at(-1)!.value).not.toBe(stale)
    f.passes.destroy()
    expect(f.remove.mock.calls.some(c => c[0] === stale)).toBe(false)
  })
})
