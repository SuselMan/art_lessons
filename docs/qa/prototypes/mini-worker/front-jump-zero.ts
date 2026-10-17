import type {WatercolorPasses} from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import {FRONT_JUMP_ZERO_ANCHOR, transformFrontJumpZeroSource} from './front-zero-source.cjs'

type Paths = {dispose(): void; forget(): void; invalidate(): void}
type Slots = {gl: WebGLRenderingContext; _frontPaths: Paths | null}
const installed = new WeakSet<WatercolorPasses>()

/** QA-only, exclusive GL instance and passes lifecycle. Install BEFORE the
 * solve; keep cleanup in the caller's finally, including first-use failure.
 * No GL allocation/compilation here: the next prefix call creates new paths
 * through the unchanged private factory. Old paths (about20MiB at1024) remain
 * retained for rollback; account for that memory during this diagnostic.
 *
 * shaderSource interception is private-factory coupling, NOT a product API.
 * It may also see another passes instance on the same GL: do not run foreign
 * field jobs, another shader interceptor, init/forget/destroy or context
 * restoration before cleanup. Other shader source strings pass unchanged.
 * A partial failing private factory can leak its own unpublished programs
 * (existing factory/utils behaviour); no new Paths object exists to dispose
 * in that case. Finally still restores the old field and shaderSource hook.
 */
export function installFrontJumpZero(passes: WatercolorPasses): (() => void) & {stats:{transformedShaders:number}} {
  if (installed.has(passes)) throw new Error('Front jump zero already installed')
  const slots = passes as unknown as Slots, gl = slots.gl
  const pathsDescriptor = Object.getOwnPropertyDescriptor(passes, '_frontPaths')
  const shaderDescriptor = Object.getOwnPropertyDescriptor(gl, 'shaderSource')
  const original = gl.shaderSource, oldPaths = slots._frontPaths
  if (!pathsDescriptor?.writable || !pathsDescriptor.configurable || typeof original !== 'function' || (shaderDescriptor && !shaderDescriptor.configurable)) throw new Error('Front jump zero requires mutable private field and shaderSource slot')
  const restoreShader = () => {
    if (shaderDescriptor) Object.defineProperty(gl, 'shaderSource', shaderDescriptor)
    else Reflect.deleteProperty(gl, 'shaderSource')
  }
  const stats={transformedShaders:0}
  const shaderSource: WebGLRenderingContext['shaderSource'] = function(this: WebGLRenderingContext, shader, source) {
    if(source.includes(FRONT_JUMP_ZERO_ANCHOR)){source=transformFrontJumpZeroSource(source);stats.transformedShaders++}
    return original.call(this, shader, source)
  }
  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    const created = slots._frontPaths
    try { restoreShader() }
    finally {
      try { Object.defineProperty(passes, '_frontPaths', pathsDescriptor) }
      finally {
        installed.delete(passes)
        try {
          // The diagnostic may have changed coverage in this same field.
          // Restore identity/handles, but never resurrect its pre-solve cache.
          oldPaths?.invalidate()
        } finally {
          if (created && created !== oldPaths) {
            if (gl.isContextLost()) created.forget()
            else created.dispose()
          }
        }
      }
    }
  }
  try {
    Object.defineProperty(gl, 'shaderSource', {configurable: true, enumerable: shaderDescriptor?.enumerable ?? false, writable: true, value: shaderSource})
    slots._frontPaths = null
    installed.add(passes)
    return Object.assign(cleanup,{stats})
  } catch (error) { cleanup(); throw error }
}
