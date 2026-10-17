import {captureNativeOnce} from '../mini-worker/native-capture-805'
declare const __QA_NATIVE_CAPTURE__:boolean
import {createNativePuddleTarget as createSharedTarget, type NativePuddleTargetOptions} from '../../../../apps/web/src/engine/src/watercolor/puddle/PuddleTarget'
import type {PuddleParameters} from '../../../../apps/web/src/engine/src/watercolor/puddle/PuddleParameters'
export type {NativePuddleTargetOptions} from '../../../../apps/web/src/engine/src/watercolor/puddle/PuddleTarget'
/** Mini-only adapter to private engine hooks; the shared solver has an explicit host. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createNativePuddleTarget(engine: any, size: number, options: NativePuddleTargetOptions = {}) {
  const target=createSharedTarget({
    gl: engine.gl,
    settlePlan: engine._settlePlan,
    pool: engine._ribbonScratchPool,
    passes: engine._watercolorPasses,
    invalidateFrontPaths: () => engine._watercolorPasses._frontPaths?.invalidate(),
    hasActiveSettle: () => !!engine._settle,
  }, size, {
    ...options,
    readParameters: options.readParameters ?? (() => (globalThis as typeof globalThis & {
      __miniTuning?: Partial<PuddleParameters>
    }).__miniTuning ?? {}),
  })
  if(typeof __QA_NATIVE_CAPTURE__!=='undefined'&&__QA_NATIVE_CAPTURE__){
    const reset=target.resetFromScratch.bind(target)
    target.resetFromScratch=(source,tile,epoch)=>{captureNativeOnce(engine,source,tile);return reset(source,tile,epoch)}
  }
  return target
}
