import {createContrastPhase as createSharedContrastPhase} from '../../../../apps/web/src/engine/src/watercolor/puddle/ContrastPhase'
import type {PuddleParameters} from '../../../../apps/web/src/engine/src/watercolor/puddle/PuddleParameters'
/** Mini controls remain mutable; room solvers inject an immutable configuration. */
export function createContrastPhase(gl: WebGLRenderingContext) {
  return createSharedContrastPhase(gl, () => (globalThis as typeof globalThis & {
    __miniTuning?: Partial<PuddleParameters>
  }).__miniTuning ?? {})
}
