import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import { BlitPasses } from './blitPasses'
import { planStraightPresentation, StraightLayerPresentation } from './StraightLayerPresentation'

it('bounds tile plans and reduces only exact even 2x2 levels', () => {
  expect(planStraightPresentation(256, 256, 0.125, 0.125)).toEqual([{ width: 128, height: 128 }, { width: 64, height: 64 }])
  expect(planStraightPresentation(255, 256, 0.01, 0.01)).toEqual([{ width: 255, height: 256 }])
  expect(planStraightPresentation(256, 256, 0.01, 1)).toEqual([{ width: 256, height: 256 }])
  expect(() => planStraightPresentation(2048, 2048, 1, 1)).toThrow('bounds')
  expect(() => planStraightPresentation(256, 256, NaN, 1)).toThrow('scale')
})

// Lifecycle/state test only: MockGL does not execute this GLSL's RGBA math.
class StateGL extends MockGL {
  readonly VIEWPORT = 9001
  readonly COLOR_CLEAR_VALUE = 9002
  readonly COLOR_WRITEMASK = 9003
  private mask = [true, true, true, true]
  colorMask(...value: [boolean, boolean, boolean, boolean]): void { this.mask = value }
  getVertexAttrib(): null { return null }
  getVertexAttribOffset(): number { return 0 }
  isBuffer(): boolean { return true }
  isTexture(): boolean { return true }
  override getParameter(parameter: number): number | object | null {
    if (parameter === this.VIEWPORT) return [0, 0, 8, 8]
    if (parameter === this.COLOR_CLEAR_VALUE) return [0, 0, 0, 0]
    if (parameter === this.COLOR_WRITEMASK) return [...this.mask]
    return super.getParameter(parameter)
  }
}

function setup() {
  const mock = new StateGL(), gl = mock as unknown as WebGLRenderingContext
  const source = new AccumulationBuffer(gl, 8, 8, 'nearest', 'straight-rgba8')
  const quad = gl.createBuffer()!, passes = new BlitPasses(gl, quad), pool = new RibbonScratchPool(gl)
  const release = vi.fn(), reserve = vi.fn((_bytes: number) => release)
  const presentation = new StraightLayerPresentation(pool, passes, reserve)
  const close = () => { pool.destroy(); passes.destroy(); source.destroy(); gl.deleteBuffer(quad) }
  return { mock, gl, source, passes, pool, reserve, release, presentation, close }
}

it('reserves before allocation, restores crop before display and reuses ONE pool without mipmaps', () => {
  const s = setup()
  try {
    s.gl.enable(s.gl.SCISSOR_TEST)
    s.gl.colorMask(false, true, false, true)
    const blend = vi.spyOn(s.mock, 'blendFunc'), mipmaps = vi.spyOn(s.mock, 'generateMipmap')
    const matrices = vi.spyOn(s.mock, 'uniformMatrix3fv'), upload = vi.spyOn(s.mock, 'texImage2D')
    s.reserve.mockImplementation(bytes => { expect(upload).not.toHaveBeenCalled(); expect(bytes).toBe(80); return s.release })
    s.presentation.withTile(s.source, 0.125, 0.125, buffer => {
      expect(buffer.width).toBe(2); expect(buffer.samplingFilter).toBe('linear')
      expect(buffer.pixelEncoding).toBe('premultiplied-rgba8')
      expect(s.mock.isEnabled(s.mock.SCISSOR_TEST)).toBe(true)
      expect(Array.from(s.mock.getParameter(s.mock.COLOR_WRITEMASK) as boolean[])).toEqual([false, true, false, true])
      expect(s.pool.bytes).toEqual({ live: 16, free: 64 })
      expect(s.release).not.toHaveBeenCalled()
    })
    expect(matrices.mock.calls.map(([, , matrix]) => Array.from(matrix as Float32Array))).toEqual([[2, 0, 0, 0, 2, 0, 0, 0, 1], [2, 0, 0, 0, 2, 0, 0, 0, 1]])
    expect(blend).not.toHaveBeenCalled(); expect(mipmaps).not.toHaveBeenCalled()
    expect(s.pool.bytes).toEqual({ live: 0, free: 80 }); expect(s.release).toHaveBeenCalledTimes(1)
    s.reserve.mockImplementation(() => s.release)
    upload.mockClear()
    s.presentation.withTile(s.source, 0.125, 0.125, () => {})
    expect(upload).not.toHaveBeenCalled(); expect(s.release).toHaveBeenCalledTimes(2)
  } finally { s.close() }
})

it.each(['stage', 'display'] as const)('releases reservations and all borrowed buffers after %s failure', phase => {
  const s = setup()
  try {
    if (phase === 'stage') vi.spyOn(s.mock, 'drawArrays').mockImplementation(() => { throw new Error('stage failure') })
    expect(() => s.presentation.withTile(s.source, 1, 1, () => { throw new Error('display failure') })).toThrow(`${phase} failure`)
    expect(s.pool.bytes.live).toBe(0); expect(s.release).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
    s.presentation.withTile(s.source, 1, 1, () => {})
    expect(s.pool.bytes.live).toBe(0)
  } finally { s.close() }
})

it('rejects budget failure before GL allocation and forbids nested tile borrowing', () => {
  const s = setup()
  try {
    const upload = vi.spyOn(s.mock, 'texImage2D')
    s.reserve.mockImplementation(() => { throw new Error('budget denied') })
    expect(() => s.presentation.withTile(s.source, 1, 1, () => {})).toThrow('budget denied')
    expect(upload).not.toHaveBeenCalled(); expect(s.pool.bytes.live).toBe(0)
    s.reserve.mockImplementation(() => s.release)
    s.presentation.withTile(s.source, 1, 1, () => {
      expect(() => s.presentation.withTile(s.source, 1, 1, () => {})).toThrow('already active')
    })
  } finally { s.close() }
})

it('releases both reduction stages when the later GPU draw fails', () => {
  const s = setup()
  try {
    let draws = 0
    vi.spyOn(s.mock, 'drawArrays').mockImplementation(() => {
      expect(s.mock.isEnabled(s.mock.SCISSOR_TEST)).toBe(false)
      expect(s.mock.getParameter(s.mock.COLOR_WRITEMASK)).toEqual([true, true, true, true])
      if (++draws === 2) throw new Error('second reduction failed')
    })
    expect(() => s.presentation.withTile(s.source, .125, .125, () => { throw new Error('must not display') })).toThrow('second reduction failed')
    expect(draws).toBe(2); expect(s.pool.bytes).toEqual({ live: 0, free: 80 })
    expect(s.release).toHaveBeenCalledTimes(1)
  } finally { s.close() }
})

it('keeps cold allocations off the caller active sampler unit', () => {
  const s = setup(), sentinel = s.gl.createTexture()!
  try {
    s.gl.activeTexture(s.gl.TEXTURE0 + 3)
    s.gl.bindTexture(s.gl.TEXTURE_2D, sentinel)
    s.presentation.withTile(s.source, 1, 1, () => {
      expect(s.gl.getParameter(s.gl.ACTIVE_TEXTURE)).toBe(s.gl.TEXTURE0 + 3)
      expect(s.gl.getParameter(s.gl.TEXTURE_BINDING_2D)).toBe(sentinel)
    })
    expect(s.gl.getParameter(s.gl.TEXTURE_BINDING_2D)).toBe(sentinel)
  } finally { s.gl.deleteTexture(sentinel); s.close() }
})
