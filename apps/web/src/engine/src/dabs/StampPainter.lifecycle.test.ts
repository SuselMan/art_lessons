import { afterEach, expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { StampPainter, type StampContext } from './StampPainter'

function setup() {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const painter = new StampPainter({ gl } as StampContext)
  return { gl, painter }
}
function failure(work: () => void): unknown {
  try { work() } catch (error) { return error }
  throw new Error('Expected failure')
}
afterEach(() => vi.restoreAllMocks())

it.each(['getUniformLocation', 'getAttribLocation', 'getExtension'] as const)('rolls back acquired names after %s failure and preserves the first exact error', boundary => {
  const { gl, painter } = setup(), primary = new Error(boundary)
  const textures = vi.spyOn(gl, 'createTexture'), programs = vi.spyOn(gl, 'createProgram'), buffers = vi.spyOn(gl, 'createBuffer')
  const dt = vi.spyOn(gl, 'deleteTexture').mockImplementationOnce(() => { throw new Error('secondary') })
  const dp = vi.spyOn(gl, 'deleteProgram'), db = vi.spyOn(gl, 'deleteBuffer')
  vi.spyOn(gl, boundary).mockImplementationOnce(() => { throw primary })
  expect(failure(() => painter.initGL())).toBe(primary)
  expect(dt.mock.calls.map(([h]) => h)).toEqual(textures.mock.results.map(r => r.value))
  expect(dp.mock.calls.map(([h]) => h)).toEqual(programs.mock.results.map(r => r.value))
  expect(db.mock.calls.map(([h]) => h)).toEqual(buffers.mock.results.map(r => r.value))
  const counts = [dt.mock.calls.length, dp.mock.calls.length, db.mock.calls.length]
  painter.destroy(); expect([dt.mock.calls.length, dp.mock.calls.length, db.mock.calls.length]).toEqual(counts)
})
it('rejects null instance buffer and retires preceding resources', () => {
  const { gl, painter } = setup(), dt = vi.spyOn(gl, 'deleteTexture'), dp = vi.spyOn(gl, 'deleteProgram')
  Object.defineProperty(gl, 'createBuffer', { value: () => null })
  expect(() => painter.initGL()).toThrow('Stamp instance buffer allocation failed')
  expect(dt).toHaveBeenCalledOnce(); expect(dp).toHaveBeenCalledTimes(2)
})
it('destroy is all-attempt and idempotent, unbinding only an owned current program', () => {
  const { gl, painter } = setup(); painter.initGL()
  const primary = new Error('first delete'), dt = vi.spyOn(gl, 'deleteTexture').mockImplementationOnce(() => { throw primary })
  const dp = vi.spyOn(gl, 'deleteProgram'), db = vi.spyOn(gl, 'deleteBuffer'), use = vi.spyOn(gl, 'useProgram')
  vi.spyOn(gl, 'getParameter').mockReturnValue(painter.program)
  expect(failure(() => painter.destroy())).toBe(primary)
  expect(use).toHaveBeenCalledExactlyOnceWith(null); expect(dp).toHaveBeenCalledTimes(2); expect(db).toHaveBeenCalledOnce()
  painter.destroy(); expect(dt).toHaveBeenCalledOnce(); expect(dp).toHaveBeenCalledTimes(2)
})
it('preserves foreign program and borrowed quad; empty destroy does no GL work', () => {
  const { gl, painter } = setup(), foreign = gl.createProgram(), use = vi.spyOn(gl, 'useProgram'), dp = vi.spyOn(gl, 'deleteProgram'), db = vi.spyOn(gl, 'deleteBuffer')
  painter.destroy(); expect(dp).not.toHaveBeenCalled(); expect(db).not.toHaveBeenCalled()
  painter.initGL(); vi.spyOn(gl, 'getParameter').mockReturnValue(foreign)
  painter.destroy(); expect(use).not.toHaveBeenCalled(); expect(dp.mock.calls.some(([h]) => h === foreign)).toBe(false); expect(db).toHaveBeenCalledOnce()
})
it('still attempts every delete when the context status query throws', () => {
  const { gl, painter } = setup(); painter.initGL()
  const primary = new Error('context query'), dt = vi.spyOn(gl, 'deleteTexture'), dp = vi.spyOn(gl, 'deleteProgram'), db = vi.spyOn(gl, 'deleteBuffer')
  vi.spyOn(gl, 'isContextLost').mockImplementation(() => { throw primary })
  expect(failure(() => painter.destroy())).toBe(primary)
  expect(dt).toHaveBeenCalledOnce(); expect(dp).toHaveBeenCalledTimes(2); expect(db).toHaveBeenCalledOnce()
})
it('forgets handles during context loss without deleting them or foreign resources', () => {
  const { gl, painter } = setup(); painter.initGL()
  const dt = vi.spyOn(gl, 'deleteTexture'), dp = vi.spyOn(gl, 'deleteProgram'), db = vi.spyOn(gl, 'deleteBuffer')
  const lost = vi.spyOn(gl, 'isContextLost').mockReturnValue(true)
  painter.destroy(); lost.mockReturnValue(false); painter.destroy()
  expect(dt).not.toHaveBeenCalled(); expect(dp).not.toHaveBeenCalled(); expect(db).not.toHaveBeenCalled()
})
it('keeps the accepted generation on failed reinit and retires it after a successful replacement', () => {
  const { gl, painter } = setup(); painter.initGL()
  const oldProgram = painter.program, primary = new Error('candidate uniform')
  const created = vi.spyOn(gl, 'createProgram'), deleted = vi.spyOn(gl, 'deleteProgram')
  vi.spyOn(gl, 'getUniformLocation').mockImplementationOnce(() => { throw primary })
  expect(failure(() => painter.initGL())).toBe(primary); expect(painter.program).toBe(oldProgram)
  expect(deleted.mock.calls.map(([h]) => h)).toEqual(created.mock.results.map(r => r.value))
  deleted.mockClear(); painter.initGL()
  expect(painter.program).not.toBe(oldProgram); expect(deleted.mock.calls.some(([h]) => h === oldProgram)).toBe(true)
  expect(deleted.mock.calls.some(([h]) => h === painter.program)).toBe(false)
  painter.destroy()
})
it('keeps the new accepted generation if retirement of its predecessor throws', () => {
  const { gl, painter } = setup(); painter.initGL()
  const old = painter.program, primary = new Error('old deletion'), dp = vi.spyOn(gl, 'deleteProgram')
  dp.mockImplementationOnce(() => { throw primary })
  expect(failure(() => painter.initGL())).toBe(primary)
  const accepted = painter.program
  expect(accepted).not.toBe(old); expect(dp).toHaveBeenCalledTimes(2)
  painter.destroy(); expect(dp.mock.calls.filter(([h]) => h === accepted)).toHaveLength(1)
})
it('skips invalid prior generation names on restoration and deletes the new generation once', () => {
  const { gl, painter } = setup()
  const textures = vi.spyOn(gl, 'createTexture'), programs = vi.spyOn(gl, 'createProgram'), buffers = vi.spyOn(gl, 'createBuffer')
  painter.initGL()
  const oldTextures = new Set(textures.mock.results.map(r => r.value)), oldPrograms = new Set(programs.mock.results.map(r => r.value)), oldBuffers = new Set(buffers.mock.results.map(r => r.value))
  Object.defineProperty(gl, 'isTexture', { value: (h: WebGLTexture) => !oldTextures.has(h) })
  Object.defineProperty(gl, 'isProgram', { value: (h: WebGLProgram) => !oldPrograms.has(h) })
  Object.defineProperty(gl, 'isBuffer', { value: (h: WebGLBuffer) => !oldBuffers.has(h) })
  const dt = vi.spyOn(gl, 'deleteTexture'), dp = vi.spyOn(gl, 'deleteProgram'), db = vi.spyOn(gl, 'deleteBuffer')
  painter.initGL(); expect(dt).not.toHaveBeenCalled(); expect(dp).not.toHaveBeenCalled(); expect(db).not.toHaveBeenCalled()
  painter.destroy(); expect(dt).toHaveBeenCalledOnce(); expect(dp).toHaveBeenCalledTimes(2); expect(db).toHaveBeenCalledOnce()
})
it.each([1, 2])('rolls back noise and earlier programs when program %i compilation fails', ordinal => {
  const { gl, painter } = setup(), primary = new Error('shader')
  const original = gl.compileShader.bind(gl), compile = vi.spyOn(gl, 'compileShader')
  compile.mockImplementation(shader => { if (compile.mock.calls.length === ordinal * 2) throw primary; original(shader) })
  const dt = vi.spyOn(gl, 'deleteTexture'), dp = vi.spyOn(gl, 'deleteProgram')
  expect(failure(() => painter.initGL())).toBe(primary)
  expect(dt).toHaveBeenCalledOnce(); expect(dp).toHaveBeenCalledTimes(ordinal - 1)
})
it('deletes every owned name even when validity queries throw', () => {
  const { gl, painter } = setup(); painter.initGL()
  const primary = new Error('validity')
  for (const method of ['isTexture', 'isProgram', 'isBuffer']) Object.defineProperty(gl, method, { value: () => { throw primary } })
  const dt = vi.spyOn(gl, 'deleteTexture'), dp = vi.spyOn(gl, 'deleteProgram'), db = vi.spyOn(gl, 'deleteBuffer')
  expect(failure(() => painter.destroy())).toBe(primary)
  expect(dt).toHaveBeenCalledOnce(); expect(dp).toHaveBeenCalledTimes(2); expect(db).toHaveBeenCalledOnce()
})
