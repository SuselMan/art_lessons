import { afterEach, expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { BlitPasses } from './blitPasses'
import { createFullscreenQuad, createProgram, createQuadBuffer, createShader } from './utils'

afterEach(() => { vi.restoreAllMocks() })

function setup() {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const foreign = { shader: gl.createShader(gl.VERTEX_SHADER)!, program: gl.createProgram()!, buffer: gl.createBuffer()! }
  const originalProgram = gl.createProgram.bind(gl)
  // Explicit nullable allocation doubles model WebGL failures even where an
  // ambient browser overload narrows these methods to non-null handles.
  const shaders = vi.fn<(type: number) => WebGLShader | null>(gl.createShader.bind(gl))
  const programs = vi.fn<() => WebGLProgram | null>(originalProgram)
  const buffers = vi.fn<() => WebGLBuffer | null>(gl.createBuffer.bind(gl))
  Object.defineProperties(gl, {
    createShader: { configurable: true, value: shaders },
    createProgram: { configurable: true, value: programs },
    createBuffer: { configurable: true, value: buffers },
  })
  const deleteShader = vi.spyOn(gl, 'deleteShader'), deleteProgram = vi.spyOn(gl, 'deleteProgram'), deleteBuffer = vi.spyOn(gl, 'deleteBuffer')
  const use = vi.spyOn(gl, 'useProgram')
  const retired = () => {
    for (const [created, deleted] of [[shaders, deleteShader], [programs, deleteProgram], [buffers, deleteBuffer]] as const) {
      for (const result of created.mock.results) if (result.type === 'return' && result.value) {
        expect(deleted.mock.calls.filter(([handle]) => handle === result.value)).toHaveLength(1)
      }
    }
    expect(deleteShader.mock.calls.some(([h]) => h === foreign.shader)).toBe(false)
    expect(deleteProgram.mock.calls.some(([h]) => h === foreign.program)).toBe(false)
    expect(deleteBuffer.mock.calls.some(([h]) => h === foreign.buffer)).toBe(false)
  }
  return { gl, foreign, originalProgram, shaders, programs, buffers, deleteShader, deleteProgram, deleteBuffer, use, retired }
}
function failure(work: () => unknown): unknown {
  try { work() } catch (error) { return error }
  throw new Error('Expected injected failure')
}

it.each(['shaderSource', 'compileShader', 'getShaderParameter', 'getShaderInfoLog'] as const)('releases the local shader when %s throws', boundary => {
  const s = setup(), primary = new Error(boundary)
  if (boundary === 'getShaderInfoLog') vi.spyOn(s.gl, 'getShaderParameter').mockReturnValue(false)
  vi.spyOn(s.gl, boundary).mockImplementationOnce(() => { throw primary })
  expect(failure(() => createShader(s.gl, s.gl.VERTEX_SHADER, 'source'))).toBe(primary)
  s.retired()
})
it('rejects null shader allocation before uploading source', () => {
  const s = setup(), source = vi.spyOn(s.gl, 'shaderSource')
  s.shaders.mockReturnValueOnce(null)
  expect(() => createShader(s.gl, s.gl.VERTEX_SHADER, 'source')).toThrow('Shader allocation failed')
  expect(source).not.toHaveBeenCalled(); s.retired()
})
it('preserves compile failure when shader deletion also fails', () => {
  const s = setup()
  vi.spyOn(s.gl, 'getShaderParameter').mockReturnValue(false)
  vi.spyOn(s.gl, 'getShaderInfoLog').mockReturnValue('invalid source')
  s.deleteShader.mockImplementationOnce(() => { throw new Error('delete failure') })
  expect(() => createShader(s.gl, s.gl.VERTEX_SHADER, 'source')).toThrow('Shader compile error: invalid source')
  s.retired()
})
it.each(['fragment', 'createProgram', 'attachShader', 'linkProgram', 'getProgramParameter', 'getProgramInfoLog', 'deleteShader'] as const)('unwinds all acquired program locals at %s failure', boundary => {
  const s = setup(), primary = new Error(boundary)
  if (boundary === 'fragment') {
    // The first shader succeeds; the second source upload fails.
    vi.spyOn(s.gl, 'shaderSource').mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw primary })
  } else if (boundary === 'createProgram') s.programs.mockImplementationOnce(() => { throw primary })
  else if (boundary === 'deleteShader') s.deleteShader.mockImplementationOnce(() => { throw primary })
  else {
    if (boundary === 'getProgramInfoLog') vi.spyOn(s.gl, 'getProgramParameter').mockReturnValue(false)
    vi.spyOn(s.gl, boundary).mockImplementationOnce(() => { throw primary })
  }
  expect(failure(() => createProgram(s.gl, 'vertex', 'fragment'))).toBe(primary)
  s.retired(); expect(s.use).not.toHaveBeenCalled()
})
it('rejects null program and cleans both shaders without passing null to attachShader', () => {
  const s = setup(), attach = vi.spyOn(s.gl, 'attachShader')
  s.programs.mockReturnValueOnce(null)
  expect(() => createProgram(s.gl, 'vertex', 'fragment')).toThrow('Program allocation failed')
  expect(attach).not.toHaveBeenCalled(); s.retired()
})
it('preserves link error through all cleanup failures', () => {
  const s = setup()
  vi.spyOn(s.gl, 'getProgramParameter').mockReturnValue(false)
  vi.spyOn(s.gl, 'getProgramInfoLog').mockReturnValue('bad link')
  s.deleteProgram.mockImplementationOnce(() => { throw new Error('program deletion') })
  expect(() => createProgram(s.gl, 'vertex', 'fragment')).toThrow('Program link error: bad link')
  s.retired()
})
it.each([createQuadBuffer, createFullscreenQuad])('%s retains its local VBO until upload succeeds', build => {
  for (const boundary of ['bindBuffer', 'bufferData'] as const) {
    const s = setup(), primary = new Error(boundary)
    vi.spyOn(s.gl, boundary).mockImplementationOnce(() => { throw primary })
    s.deleteBuffer.mockImplementationOnce(() => { throw new Error('secondary delete') })
    expect(failure(() => build(s.gl))).toBe(primary)
    s.retired(); vi.restoreAllMocks()
  }
})
it.each([createQuadBuffer, createFullscreenQuad])('%s rejects null VBO before binding', build => {
  const s = setup(), bind = vi.spyOn(s.gl, 'bindBuffer')
  s.buffers.mockReturnValueOnce(null)
  expect(() => build(s.gl)).toThrow('Buffer allocation failed')
  expect(bind).not.toHaveBeenCalled(); s.retired()
})

function blitSetup() {
  const s = setup(), vao = {}, deleteVao = vi.fn(), createVao = vi.fn((): WebGLVertexArrayObjectOES | null => vao)
  // The production overload is selected by the extension name; this test
  // supplies only the optional VAO interface used during cold construction.
  const extension = vi.fn((name: string): unknown => name === 'OES_vertex_array_object'
    ? { createVertexArrayOES: createVao, deleteVertexArrayOES: deleteVao } : null)
  Object.defineProperty(s.gl, 'getExtension', { configurable: true, value: extension })
  return { ...s, vao, deleteVao, createVao }
}
it.each([1, 2, 3, 4])('rolls back partial BlitPasses at program allocation %i', ordinal => {
  const s = blitSetup(), original = s.originalProgram, primary = new Error('program allocation')
  let n = 0
  s.programs.mockImplementation(() => { if (++n === ordinal) throw primary; return original() })
  expect(failure(() => new BlitPasses(s.gl, s.foreign.buffer))).toBe(primary)
  s.retired(); expect(s.deleteVao).toHaveBeenCalledExactlyOnceWith(s.vao)
})
it.each([
  ...Array.from({ length: 20 }, (_, i) => ({ boundary: 'getUniformLocation' as const, ordinal: i + 1 })),
  ...Array.from({ length: 4 }, (_, i) => ({ boundary: 'getAttribLocation' as const, ordinal: i + 1 })),
])('rolls back all blit programs at $boundary query $ordinal', ({ boundary, ordinal }) => {
  const s = blitSetup(), primary = new Error(`${boundary} ${ordinal}`)
  let n = 0
  if (boundary === 'getUniformLocation') {
    const original = s.gl.getUniformLocation.bind(s.gl)
    vi.spyOn(s.gl, boundary).mockImplementation((...args) => { if (++n === ordinal) throw primary; return original(...args) })
  } else {
    const original = s.gl.getAttribLocation.bind(s.gl)
    vi.spyOn(s.gl, boundary).mockImplementation((...args) => { if (++n === ordinal) throw primary; return original(...args) })
  }
  s.deleteVao.mockImplementationOnce(() => { throw new Error('secondary VAO delete') })
  expect(failure(() => new BlitPasses(s.gl, s.foreign.buffer))).toBe(primary)
  s.retired(); expect(s.deleteVao).toHaveBeenCalledExactlyOnceWith(s.vao)
  expect(s.use).not.toHaveBeenCalled()
})
it('rejects present-extension null VAO before compiling programs', () => {
  const s = blitSetup()
  s.createVao.mockReturnValueOnce(null)
  expect(() => new BlitPasses(s.gl, s.foreign.buffer)).toThrow('Presentation VAO allocation failed')
  expect(s.programs).not.toHaveBeenCalled(); expect(s.deleteVao).not.toHaveBeenCalled(); s.retired()
})
it('allows optimized-out null uniforms and absent VAO extension on the valid fallback', () => {
  const s = setup()
  vi.spyOn(s.gl, 'getUniformLocation').mockReturnValue(null)
  const passes = new BlitPasses(s.gl, s.foreign.buffer)
  passes.destroy(); passes.destroy()
  s.retired()
})
it('attempts every owned program after VAO delete failure, preserves primary and never deletes borrowed VBO', () => {
  const s = blitSetup(), passes = new BlitPasses(s.gl, s.foreign.buffer), primary = new Error('VAO delete')
  s.deleteVao.mockImplementationOnce(() => { throw primary })
  s.deleteProgram.mockImplementationOnce(() => { throw new Error('secondary program delete') })
  expect(failure(() => passes.destroy())).toBe(primary)
  passes.destroy(); s.retired(); expect(s.deleteVao).toHaveBeenCalledOnce()
})


it.each([1, 2, 3, 4])('unwinds earlier blit programs on null program allocation %i', ordinal => {
  const s = blitSetup(), original = s.originalProgram
  let n = 0
  s.programs.mockImplementation(() => ++n === ordinal ? null : original())
  expect(() => new BlitPasses(s.gl, s.foreign.buffer)).toThrow('Program allocation failed')
  s.retired(); expect(s.deleteVao).toHaveBeenCalledExactlyOnceWith(s.vao)
})
it('propagates VAO allocation throw without acquiring programs or touching borrowed names', () => {
  const s = blitSetup(), primary = new Error('VAO allocation')
  s.createVao.mockImplementationOnce(() => { throw primary })
  expect(failure(() => new BlitPasses(s.gl, s.foreign.buffer))).toBe(primary)
  expect(s.programs).not.toHaveBeenCalled(); expect(s.deleteVao).not.toHaveBeenCalled(); s.retired()
})
it('only unbinds an owned active program and keeps a foreign current program unchanged', () => {
  const s = setup()
  Object.defineProperty(s.gl, 'CURRENT_PROGRAM', { configurable: true, value: 0x8b8d })
  let current: WebGLProgram | null = s.foreign.program
  const query = s.gl.getParameter.bind(s.gl)
  vi.spyOn(s.gl, 'getParameter').mockImplementation(pname => pname === s.gl.CURRENT_PROGRAM ? current : query(pname))
  s.use.mockImplementation(program => { current = program })
  const foreignCurrent = new BlitPasses(s.gl, s.foreign.buffer)
  foreignCurrent.destroy()
  expect(s.use).not.toHaveBeenCalled(); expect(current).toBe(s.foreign.program)
  const ownedCurrent = new BlitPasses(s.gl, s.foreign.buffer)
  current = ownedCurrent['imageProg']
  ownedCurrent.destroy()
  expect(s.use).toHaveBeenCalledExactlyOnceWith(null)
  expect(current).toBeNull(); s.retired()
})
it('does not delete dead generation names when the actual context is lost', () => {
  const s = blitSetup(), passes = new BlitPasses(s.gl, s.foreign.buffer)
  vi.spyOn(s.gl, 'isContextLost').mockReturnValue(true)
  passes.destroy(); passes.destroy()
  expect(s.deleteProgram).not.toHaveBeenCalled(); expect(s.deleteVao).not.toHaveBeenCalled()
  expect(s.use).not.toHaveBeenCalled()
})
it('retirement still attempts every delete when owned-program unbinding throws', () => {
  const s = blitSetup(), passes = new BlitPasses(s.gl, s.foreign.buffer), primary = new Error('unbind failure')
  Object.defineProperty(s.gl, 'CURRENT_PROGRAM', { configurable: true, value: 0x8b8d })
  vi.spyOn(s.gl, 'getParameter').mockReturnValue(passes['imageProg'])
  s.use.mockImplementationOnce(() => { throw primary })
  expect(failure(() => passes.destroy())).toBe(primary)
  passes.destroy(); s.retired(); expect(s.deleteVao).toHaveBeenCalledOnce()
})


it.each([1, 2])('rejects null shader allocation %i in a program and retires previous shaders', ordinal => {
  const s = setup(), original = MockGL.prototype.createShader.bind(s.gl)
  let n = 0
  s.shaders.mockImplementation(type => ++n === ordinal ? null : original(type))
  expect(() => createProgram(s.gl, 'vertex', 'fragment')).toThrow('Shader allocation failed')
  expect(s.programs).not.toHaveBeenCalled(); s.retired()
})
it('keeps cleanup reachable after a context-status query throws', () => {
  const s = blitSetup(), passes = new BlitPasses(s.gl, s.foreign.buffer), primary = new Error('status query')
  vi.spyOn(s.gl, 'isContextLost').mockImplementationOnce(() => { throw primary })
  s.deleteProgram.mockImplementationOnce(() => { throw new Error('secondary delete') })
  expect(failure(() => passes.destroy())).toBe(primary)
  s.retired(); expect(s.deleteVao).toHaveBeenCalledOnce()
})
it.each([createQuadBuffer, createFullscreenQuad])('%s preserves the exact healthy VBO payload and leaves ownership with its caller', build => {
  const s = setup(), upload = vi.spyOn(s.gl, 'bufferData'), bind = vi.spyOn(s.gl, 'bindBuffer')
  const buffer = build(s.gl)
  expect(bind).toHaveBeenCalledExactlyOnceWith(s.gl.ARRAY_BUFFER, buffer)
  expect(upload.mock.calls[0]?.[2]).toBe(s.gl.STATIC_DRAW)
  const payload = upload.mock.calls[0]?.[1]
  expect(payload).toEqual(new Float32Array(build === createQuadBuffer
    ? [-.5, -.5, .5, -.5, -.5, .5, -.5, .5, .5, -.5, .5, .5]
    : [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]))
  expect(s.deleteBuffer).not.toHaveBeenCalled()
  s.gl.deleteBuffer(buffer); s.retired()
})
