import {createBackgroundMix as createSharedBackgroundMix} from '../../../../apps/web/src/engine/src/watercolor/puddle/BackgroundMix'
import type {PuddleParameters} from '../../../../apps/web/src/engine/src/watercolor/puddle/PuddleParameters'
export function createBackgroundMix(gl: WebGLRenderingContext, size: number, _passes: unknown) {
  return createSharedBackgroundMix(gl, size, () => (globalThis as typeof globalThis & {
    __miniTuning?: Partial<PuddleParameters>
  }).__miniTuning ?? {})
}
