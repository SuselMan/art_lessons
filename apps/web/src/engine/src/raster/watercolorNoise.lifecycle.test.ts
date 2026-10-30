import { afterEach, expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { createWatercolorNoiseTexture } from './watercolorNoise'

afterEach(() => vi.restoreAllMocks())
it('rejects null allocation before upload', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  Object.defineProperty(gl, 'createTexture', { value: () => null })
  const upload = vi.spyOn(gl, 'texImage2D')
  expect(() => createWatercolorNoiseTexture(gl)).toThrow('Watercolor noise texture allocation failed')
  expect(upload).not.toHaveBeenCalled()
})
it.each(['bindTexture', 'pixelStorei', 'texImage2D', 'texParameteri'] as const)('rolls back local noise texture after %s throws, preserving primary through cleanup errors', boundary => {
  const gl = new MockGL() as unknown as WebGLRenderingContext, foreign = gl.createTexture(), primary = new Error(boundary)
  const created = vi.spyOn(gl, 'createTexture'), deleted = vi.spyOn(gl, 'deleteTexture').mockImplementationOnce(() => { throw new Error('secondary') })
  vi.spyOn(gl, boundary).mockImplementationOnce(() => { throw primary })
  let caught: unknown
  try { createWatercolorNoiseTexture(gl) } catch (error) { caught = error }
  expect(caught).toBe(primary)
  expect(deleted).toHaveBeenCalledExactlyOnceWith(created.mock.results[0]?.value)
  expect(deleted.mock.calls.some(([h]) => h === foreign)).toBe(false)
})
it('attempts rollback when status throws, but skips deletion for a lost context', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext, primary = new Error('upload')
  vi.spyOn(gl, 'texImage2D').mockImplementation(() => { throw primary })
  const lost = vi.spyOn(gl, 'isContextLost').mockImplementationOnce(() => { throw new Error('query') }).mockReturnValue(true)
  const deleted = vi.spyOn(gl, 'deleteTexture')
  expect(() => createWatercolorNoiseTexture(gl)).toThrow(primary); expect(deleted).toHaveBeenCalledOnce()
  expect(() => createWatercolorNoiseTexture(gl)).toThrow(primary); expect(deleted).toHaveBeenCalledOnce(); expect(lost).toHaveBeenCalledTimes(2)
})
