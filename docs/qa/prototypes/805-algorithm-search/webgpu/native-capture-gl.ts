import { NATIVE_PAPER_CAPTURE_FRAG } from './native-capture'

/** QA-only, synchronous and outside timing. Output remains GL bottom-up RGBA8. */
export function captureNativePaperHeight(gl: WebGLRenderingContext, texture: WebGLTexture, size: number,
  tileOrigin: readonly [number, number], paperWorldSize: readonly [number, number], paperScale: number): Uint8Array {
  if (!Number.isInteger(size) || size < 1 || size > gl.getParameter(gl.MAX_TEXTURE_SIZE) || !texture ||
      tileOrigin.length !== 2 || !tileOrigin.every(Number.isFinite) || paperWorldSize.length !== 2 ||
      !paperWorldSize.every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(paperScale) || paperScale <= 0) throw Error('Invalid paper capture arguments')
  if (gl.isContextLost()) throw Error('Paper capture context lost')
  const ext = gl.getExtension('OES_vertex_array_object')
  if (!ext) throw Error('Paper capture requires isolated OES_vertex_array_object')
  // Never silently consume an existing renderer error and call the capture clean.
  const initialError = gl.getError()
  if (initialError !== gl.NO_ERROR) throw Error(`Paper capture pre-existing GL error ${initialError}`)
  const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
  const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null
  const vao = gl.getParameter(ext.VERTEX_ARRAY_BINDING_OES) as WebGLVertexArrayObjectOES | null
  const arrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
  const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number
  const colorMask = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[]
  const caps = [gl.BLEND, gl.SCISSOR_TEST, gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.DITHER]
  const enabled = caps.map(cap => gl.isEnabled(cap))
  gl.activeTexture(gl.TEXTURE0)
  const unit0Texture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
  let vertex: WebGLShader | null = null, fragment: WebGLShader | null = null, ownedProgram: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null, target: WebGLTexture | null = null, fbo: WebGLFramebuffer | null = null
  let ownedVAO: WebGLVertexArrayObjectOES | null = null
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)
    if (!shader) throw Error('Paper capture shader allocation failed')
    try {
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(`Paper capture shader: ${gl.getShaderInfoLog(shader)}`)
      return shader
    } catch (error) { gl.deleteShader(shader); throw error }
  }
  try {
    vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.0,1.0);}')
    fragment = compile(gl.FRAGMENT_SHADER, NATIVE_PAPER_CAPTURE_FRAG)
    ownedProgram = gl.createProgram()
    if (!ownedProgram) throw Error('Paper capture program allocation failed')
    gl.attachShader(ownedProgram, vertex); gl.attachShader(ownedProgram, fragment); gl.linkProgram(ownedProgram)
    if (!gl.getProgramParameter(ownedProgram, gl.LINK_STATUS)) throw Error(`Paper capture link: ${gl.getProgramInfoLog(ownedProgram)}`)
    buffer = gl.createBuffer(); target = gl.createTexture(); fbo = gl.createFramebuffer(); ownedVAO = ext.createVertexArrayOES()
    if (!buffer || !target || !fbo || !ownedVAO) throw Error('Paper capture resource allocation failed')
    gl.bindTexture(gl.TEXTURE_2D, target)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('Paper capture framebuffer incomplete')
    ext.bindVertexArrayOES(ownedVAO); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    gl.useProgram(ownedProgram)
    const position = gl.getAttribLocation(ownedProgram, 'a_position')
    if (position < 0) throw Error('Paper capture position missing')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const uniform = (name: string): WebGLUniformLocation => {
      const location = gl.getUniformLocation(ownedProgram!, name)
      if (location === null) throw Error(`Paper capture uniform missing: ${name}`)
      return location
    }
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(uniform('u_paperHeightMap'), 0)
    gl.uniform2f(uniform('u_paperOrigin'), tileOrigin[0], -(tileOrigin[1] + size))
    gl.uniform2f(uniform('u_paperTexSize'), paperWorldSize[0], paperWorldSize[1])
    gl.uniform2f(uniform('u_paperScale'), paperScale, paperScale)
    caps.forEach(cap => gl.disable(cap)); gl.colorMask(true, true, true, true); gl.viewport(0, 0, size, size)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    const pixels = new Uint8Array(size * size * 4)
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    const error = gl.getError()
    if (gl.isContextLost() || error !== gl.NO_ERROR) throw Error(`Paper capture GL error ${error}`)
    return pixels
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
    gl.useProgram(program); ext.bindVertexArrayOES(vao); gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, unit0Texture); gl.activeTexture(activeTexture)
    caps.forEach((cap, i) => enabled[i] ? gl.enable(cap) : gl.disable(cap))
    gl.colorMask(colorMask[0]!, colorMask[1]!, colorMask[2]!, colorMask[3]!)
    if (ownedVAO) ext.deleteVertexArrayOES(ownedVAO)
    if (fbo) gl.deleteFramebuffer(fbo)
    if (target) gl.deleteTexture(target)
    if (buffer) gl.deleteBuffer(buffer)
    if (ownedProgram) gl.deleteProgram(ownedProgram)
    if (fragment) gl.deleteShader(fragment)
    if (vertex) gl.deleteShader(vertex)
  }
}
