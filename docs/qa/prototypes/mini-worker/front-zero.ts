import type {WatercolorPasses} from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import {DISPLAY_VERT, WC_WATER_FRONT_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {createProgram, getUniforms} from '../../../../apps/web/src/engine/src/raster/utils'
import {transformFrontZeroSource} from './front-zero-source.cjs'

type Uniforms = Record<string, WebGLUniformLocation | null>
type Slots = {gl: WebGLRenderingContext; _waterFrontProg: WebGLProgram; _waterFrontUni: Uniforms; _waterFrontPosLoc: number}
const installed = new WeakSet<WatercolorPasses>()

/** QA-only, explicit opt-in. Precompile before timing; does not replace the
 * target, passes, geometry, prefix shader or scheduler. Restore before passes
 * init/destroy/context restoration. Do not stack another native-program swap.
 * Nonnegative finite bounded uniforms gate the shortcut; unsupported uniforms
 * execute the complete original shader. Paper/noise must retain paint filters.
 * This is a candidate requiring per-pass/final GPU byte A/B, not a speed claim.
 */
export function installFrontZero(passes: WatercolorPasses): () => void {
  if (installed.has(passes)) throw new Error('Front zero already installed')
  const slots = passes as unknown as Slots, gl = slots.gl
  const keys = ['_waterFrontProg', '_waterFrontUni', '_waterFrontPosLoc'] as const
  const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(passes, key))
  if (!slots._waterFrontProg || !slots._waterFrontUni || slots._waterFrontPosLoc < 0 || descriptors.some(d => !d || !d.writable)) throw new Error('Front zero requires initialized mutable program slots')
  const restore = () => { keys.forEach((key, i) => Object.defineProperty(passes, key, descriptors[i]!)) }
  const program = createProgram(gl, DISPLAY_VERT, transformFrontZeroSource(WC_WATER_FRONT_FRAG))
  try {
    const uniforms = getUniforms(gl, program, Object.keys(slots._waterFrontUni))
    const position = gl.getAttribLocation(program, 'a_position')
    if (position < 0) throw new Error('Front zero position missing')
    slots._waterFrontProg = program
    slots._waterFrontUni = uniforms
    slots._waterFrontPosLoc = position
    installed.add(passes)
    let closed = false
    return () => {
      if (closed) return
      closed = true
      try { restore() }
      finally { installed.delete(passes); gl.deleteProgram(program) }
    }
  } catch (error) {
    try { restore() } finally { gl.deleteProgram(program) }
    throw error
  }
}
