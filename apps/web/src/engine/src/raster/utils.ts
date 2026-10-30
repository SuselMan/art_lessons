// Allocation helpers retain every local name until successful return. Cleanup
// attempts never replace the triggering compile/link/upload error.
export function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Shader allocation failed')
  try {
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader)
      throw new Error(`Shader compile error: ${info}`)
    }
    return shader
  } catch (error) {
    try { gl.deleteShader(shader) } catch { /* Preserve the primary failure. */ }
    throw error
  }
}

export function createProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  let vert: WebGLShader | null = null
  let frag: WebGLShader | null = null
  let program: WebGLProgram | null = null
  let failed = false
  let firstError: unknown
  const attempt = (work: () => void): void => {
    try { work() } catch (error) {
      if (!failed) { failed = true; firstError = error }
    }
  }
  attempt(() => {
    vert = createShader(gl, gl.VERTEX_SHADER, vertSrc)
    frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc)
    program = gl.createProgram()
    if (!program) throw new Error('Program allocation failed')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program)
      throw new Error(`Program link error: ${info}`)
    }
  })
  // Each shader has one retirement attempt, including when the other delete
  // throws. A cleanup failure also makes the unreturned program ours to unwind.
  if (vert) attempt(() => gl.deleteShader(vert))
  if (frag) attempt(() => gl.deleteShader(frag))
  if (failed) {
    if (program) attempt(() => gl.deleteProgram(program))
    throw firstError
  }
  return program!
}

export function getUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  names: string[],
): Record<string, WebGLUniformLocation | null> {
  const locs: Record<string, WebGLUniformLocation | null> = {}
  for (const name of names) {
    locs[name] = gl.getUniformLocation(program, name)
  }
  return locs
}

// Unit quad covering -0.5..0.5 (used for dab rendering)
export function createQuadBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  const buf = gl.createBuffer()
  if (!buf) throw new Error('Buffer allocation failed')
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
      -0.5,  0.5,
      -0.5,  0.5,
       0.5, -0.5,
       0.5,  0.5,
    ]), gl.STATIC_DRAW)
    return buf
  } catch (error) {
    try { gl.deleteBuffer(buf) } catch { /* Preserve the primary failure. */ }
    throw error
  }
}

// Full-screen quad covering -1..1 (used for display/composite passes)
export function createFullscreenQuad(gl: WebGLRenderingContext): WebGLBuffer {
  const buf = gl.createBuffer()
  if (!buf) throw new Error('Buffer allocation failed')
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), gl.STATIC_DRAW)
    return buf
  } catch (error) {
    try { gl.deleteBuffer(buf) } catch { /* Preserve the primary failure. */ }
    throw error
  }
}
