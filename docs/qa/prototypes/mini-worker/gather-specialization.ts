import type {WatercolorPasses} from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import type {WatercolorPassesContext} from '../../../../apps/web/src/engine/src/raster/WatercolorPassTypes'
import {DISPLAY_VERT, WC_FIELD_OP_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'

/** QA-only: same literal operator, with only its mode uniform made constant.
 * No tap reordering, precision change, separable blur or intermediate format.
 * Different compiler optimisation may STILL change bytes: require GPU A/B.
 */
export function gatherSpecializationSource(): string {
  const declaration = 'uniform float u_mode;'
  if (WC_FIELD_OP_FRAG.split(declaration).length !== 2) throw new Error('Gather specialization: mode declaration changed')
  return WC_FIELD_OP_FRAG.replace(declaration, 'const float u_mode = 5.0;')
}

type Draw = (...args: Parameters<WatercolorPasses['fieldOp']>) => void
type RuntimeSlots = {ctx: WatercolorPassesContext; fieldOpDraw: Draw}
const installed = new WeakSet<WatercolorPasses>()

/** Explicit opt-in; precompile BEFORE measurement. Exclusive instance patch:
 * do not stack another fieldOpDraw installer until cleanup. Restore before
 * context restoration/rebuilding passes; cleanup is idempotent. This does not
 * bypass the public fieldOp/withDiscreteGrid sampler scope.
 */
export function installGatherSpecialization(passes: WatercolorPasses): () => void {
  if (installed.has(passes)) throw new Error('Gather specialization already installed')
  const slots = passes as unknown as RuntimeSlots
  const original = slots.fieldOpDraw
  const descriptor = Object.getOwnPropertyDescriptor(passes, 'fieldOpDraw')
  if (typeof original !== 'function' || !slots.ctx || (descriptor && !descriptor.configurable)) throw new Error('Gather specialization: unsupported instance')
  const gl = slots.ctx.gl()
  let program: WebGLProgram | null = null
  const shaders: WebGLShader[] = []
  try {
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Gather specialization: shader allocation failed')
      shaders.push(shader)
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Gather specialization: ${gl.getShaderInfoLog(shader)}`)
      return shader
    }
    const vertex = compile(gl.VERTEX_SHADER, DISPLAY_VERT)
    const fragment = compile(gl.FRAGMENT_SHADER, gatherSpecializationSource())
    program = gl.createProgram()
    if (!program) throw new Error('Gather specialization: program allocation failed')
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Gather specialization: ${gl.getProgramInfoLog(program)}`)
    // Minimal bindings are valid only if this driver eliminated dead branches.
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < count; i++) {
      const uniform = gl.getActiveUniform(program, i)
      if (!uniform || (uniform.name !== 'u_a' && uniform.name !== 'u_dir')) throw new Error('Gather specialization: unexpected active uniform')
    }
    const source = gl.getUniformLocation(program, 'u_a'), direction = gl.getUniformLocation(program, 'u_dir')
    const position = gl.getAttribLocation(program, 'a_position')
    if (source === null || direction === null || position < 0) throw new Error('Gather specialization: missing interface')
    const compiled = program
    const draw: Draw = function(this: WatercolorPasses, out, a, b, mode, k, opts = {}) {
      if (mode !== 5) return original.call(this, out, a, b, mode, k, opts)
      out.beginReplaceDraw()
      try {
        if (opts.scissor) { gl.enable(gl.SCISSOR_TEST); gl.scissor(...opts.scissor) }
        gl.useProgram(compiled)
        gl.bindBuffer(gl.ARRAY_BUFFER, slots.ctx.screenBuf())
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.texture)
        gl.uniform1i(source, 0)
        gl.uniform2f(direction, opts.dir ? opts.dir[0] / out.width : 0, opts.dir ? opts.dir[1] / out.height : 0)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      } finally {
        // Match fieldOpDraw's existing scissor/endDraw contract, including throw.
        try { if (opts.scissor) gl.disable(gl.SCISSOR_TEST) } finally { out.endDraw() }
      }
    }
    Object.defineProperty(passes, 'fieldOpDraw', {configurable: true, enumerable: descriptor?.enumerable ?? false, writable: true, value: draw})
    installed.add(passes)
    let closed = false
    return () => {
      if (closed) return
      closed = true
      try {
        if (descriptor) Object.defineProperty(passes, 'fieldOpDraw', descriptor)
        else Reflect.deleteProperty(passes, 'fieldOpDraw')
      } finally { installed.delete(passes); gl.deleteProgram(compiled) }
    }
  } catch (error) {
    if (program) gl.deleteProgram(program)
    throw error
  } finally { for (const shader of shaders) gl.deleteShader(shader) }
}
