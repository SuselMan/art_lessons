import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'
import { RibbonScratchPool } from './RibbonScratchPool'

it('counts each allocation once across aliases and pooled live/free ownership', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, pool = new RibbonScratchPool(gl)
  const buffer = pool.acquire(8, 4)
  try {
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(128)
    buffer.ensureMipmaps()
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(172)
    buffer.clear(); buffer.ensureMipmaps()
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(172)
    pool.release(buffer)
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(172)
    expect(pool.acquire(8, 4)).toBe(buffer)
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(172)
    pool.release(buffer); pool.trimFree()
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0)
    const query = vi.spyOn(mock, 'getParameter')
    AccumulationBuffer.contextStorageByteLength(gl); expect(query).not.toHaveBeenCalled()
  } finally { pool.destroy() }
})
it('does not charge a failed partial allocation', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  vi.spyOn(mock, 'framebufferTexture2D').mockImplementationOnce(() => { throw new Error('failed attach') })
  expect(() => new AccumulationBuffer(gl, 2, 2)).toThrow('failed attach')
  expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0)
})
it('separates contexts and ignores old epoch destruction after loss', () => {
  const gl = new MockGL() as unknown as WebGLRenderingContext, other = new MockGL() as unknown as WebGLRenderingContext
  const stale = new AccumulationBuffer(gl, 8, 8), separate = new AccumulationBuffer(other, 2, 2)
  AccumulationBuffer.forgetContextStorage(gl)
  expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0)
  const fresh = new AccumulationBuffer(gl, 4, 4)
  try {
    stale.destroy(); stale.destroy()
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(64)
    expect(AccumulationBuffer.contextStorageByteLength(other)).toBe(16)
  } finally { fresh.destroy(); separate.destroy() }
  expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0)
  expect(AccumulationBuffer.contextStorageByteLength(other)).toBe(0)
})

it('conservatively retains attempted mip storage if generation throws', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const buffer = new AccumulationBuffer(gl, 8, 4)
  try {
    vi.spyOn(mock, 'generateMipmap').mockImplementationOnce(() => { throw new Error('mip generation failed') })
    expect(() => buffer.ensureMipmaps()).toThrow('mip generation failed')
    // A throwing storage call may already have allocated levels; retain the
    // conservative charge until this texture is deleted.
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(172)
    buffer.ensureMipmaps()
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(172)
  } finally { buffer.destroy() }
})
