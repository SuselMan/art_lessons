import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'
import { RibbonScratchPool } from './RibbonScratchPool'

it.each(['texture-handle', 'texture-storage', 'framebuffer-handle', 'framebuffer-attach', 'framebuffer-status'] as const)('unwinds partial %s allocation and leaves the shared pool charge unchanged', failure => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, pool = new RibbonScratchPool(gl)
  const textures = new Set<object>(), framebuffers = new Set<object>()
  const createTexture = mock.createTexture.bind(mock), createFramebuffer = mock.createFramebuffer.bind(mock)
  const deleteTexture = mock.deleteTexture.bind(mock), deleteFramebuffer = mock.deleteFramebuffer.bind(mock)
  vi.spyOn(mock, 'createTexture').mockImplementation(() => { const handle = createTexture(); textures.add(handle); return handle })
  vi.spyOn(mock, 'createFramebuffer').mockImplementation(() => { const handle = createFramebuffer(); framebuffers.add(handle); return handle })
  vi.spyOn(mock, 'deleteTexture').mockImplementation(handle => { textures.delete(handle); deleteTexture(handle) })
  vi.spyOn(mock, 'deleteFramebuffer').mockImplementation(handle => { framebuffers.delete(handle); deleteFramebuffer(handle) })
  const status = vi.spyOn(mock, 'checkFramebufferStatus')
  if (failure === 'texture-handle') vi.spyOn(mock, 'createTexture').mockReturnValueOnce(null as never)
  if (failure === 'texture-storage') vi.spyOn(mock, 'texImage2D').mockImplementationOnce(() => { throw new Error('storage failed') })
  if (failure === 'framebuffer-handle') vi.spyOn(mock, 'createFramebuffer').mockReturnValueOnce(null as never)
  if (failure === 'framebuffer-attach') vi.spyOn(mock, 'framebufferTexture2D').mockImplementationOnce(() => { throw new Error('attach failed') })
  if (failure === 'framebuffer-status') status.mockReturnValueOnce(-1)
  try {
    expect(() => pool.acquire(8, 8, 'straight-rgba8')).toThrow()
    expect(textures.size).toBe(0); expect(framebuffers.size).toBe(0)
    expect(pool.bytes).toEqual({ live: 0, free: 0 })
    // Failure must not mark this context as checked or poison subsequent reuse.
    const next = pool.acquire(8, 8, 'straight-rgba8')
    if (failure === 'framebuffer-status') expect(status).toHaveBeenCalledTimes(2)
    expect(textures.size).toBe(1); expect(framebuffers.size).toBe(1)
    pool.release(next); pool.trimFree()
    expect(textures.size).toBe(0); expect(framebuffers.size).toBe(0)
  } finally { pool.destroy(); vi.restoreAllMocks() }
})

it.each([[0, 8], [-1, 8], [8, 0], [1.5, 8], [NaN, 8], [Infinity, 8], [Number.MAX_SAFE_INTEGER, 8]])('rejects invalid storage dimensions %s x %s before GL allocation', (width, height) => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const create = vi.spyOn(mock, 'createTexture')
  expect(() => new AccumulationBuffer(gl, width, height)).toThrow('dimensions')
  expect(create).not.toHaveBeenCalled()
})
