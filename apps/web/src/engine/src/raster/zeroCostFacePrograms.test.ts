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
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 16, .5, { additiveZeroFaces: false })
      // World fibres keep mode1 on its general path, independently of
      // the plain-add specialization.
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 1, .5, { additiveZeroFaces: true, world: [0, 0, 1] })
      expect(f.create).not.toHaveBeenCalled()
      for (let i = 0; i < 2; i++) for (const mode of [15, 16] as const) {
        f.passes.fieldOp(f.buffer, f.buffer, f.buffer, mode, .5, { additiveZeroFaces: true })
      }
      expect(f.create).toHaveBeenCalledTimes(2)
    } finally { f.passes.destroy() }
    const optional = f.create.mock.results.map(r => r.value)
    for (const program of optional) expect(f.remove.mock.calls.filter(c => c[0] === program)).toHaveLength(1)
  })
  it.each(['add'])('forgets invalid old-context handles and creates new programs after restoration: %s', (variant) => {
    const f = fixture()
    f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 15, .5, { additiveZeroFaces: variant === 'add' })
    const stale = f.create.mock.results[0].value
    Object.defineProperty(f.gl, 'isProgram', { configurable: true, value: (program: WebGLProgram) => program !== stale })
    f.passes.initFieldPrograms(); f.passes.initFieldUniforms(); f.passes.initFieldAttributes()
    expect(f.remove.mock.calls.some(c => c[0] === stale)).toBe(false)
    f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 15, .5, { additiveZeroFaces: variant === 'add' })
    expect(f.create.mock.results.at(-1)!.value).not.toBe(stale)
    f.passes.destroy()
    expect(f.remove.mock.calls.some(c => c[0] === stale)).toBe(false)
  })
})

// Ownership/dispatch only: MockGL does not execute field shader pixels.
// Numerical parity is covered by the actual Adreno/AMD byte corpus.
describe('plain field-add program ownership', () => {
  it('keeps fibres/general modes on the original program and reuses plain addition', () => {
    const f = fixture()
    try {
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 0, .5)
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 1, .5, { world: [0, 0, 1] })
      expect(f.create).not.toHaveBeenCalled()
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 1, -.5)
      f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 1, .5, { scissor: [0, 0, 1, 1] })
      expect(f.create).toHaveBeenCalledTimes(1)
      const program = f.create.mock.results[0].value
      expect(f.gl.getParameter(f.gl.CURRENT_PROGRAM)).toBe(program)
      f.passes.destroy()
      expect(f.gl.getParameter(f.gl.CURRENT_PROGRAM)).toBe(null)
      expect(f.remove.mock.calls.filter(([p]) => p === program)).toHaveLength(1)
    } finally { f.create.mockRestore(); f.remove.mockRestore() }
  })
  it('forgets invalid context handles and recreates its lazy program', () => {
    const f = fixture()
    f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 1, .5)
    const stale = f.create.mock.results[0].value
    Object.defineProperty(f.gl, 'isProgram', { configurable: true, value: (p: WebGLProgram) => p !== stale })
    f.passes.initFieldPrograms(); f.passes.initFieldUniforms(); f.passes.initFieldAttributes()
    expect(f.remove.mock.calls.some(([p]) => p === stale)).toBe(false)
    f.passes.fieldOp(f.buffer, f.buffer, f.buffer, 1, .5)
    expect(f.create.mock.results.at(-1)!.value).not.toBe(stale)
    f.passes.destroy()
    expect(f.remove.mock.calls.some(([p]) => p === stale)).toBe(false)
  })
})
