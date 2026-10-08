import type { PencilEngineOptions } from '../../../engine'
import { joinedTouchQaEnabled } from './joinedTouchQa'
import { joinedFinishDeferredQaEnabled } from './joinedFinishDeferredQa'

/** Constructor flags only. Production values and existing explicit DEV opt-ins
 * stay identical; diagnostic selection does not own material or scheduling. */
export function watercolorQaOptions(dev: boolean, joined: unknown, deferred: string | undefined, search: string): Pick<PencilEngineOptions, 'asyncFinish' | 'joinedTouch' | 'joinedTouchMixed' | 'bandBatch' | 'joinedFinishDeferred' | 'materialPresentation' | 'diagnosticSolverBatch'> {
 const query = new URLSearchParams(search)
 return {
  asyncFinish: false,
  joinedTouch: !dev || joinedTouchQaEnabled(dev, joined, search),
  joinedTouchMixed: dev && query.get('qaJoinedTouchMixed') === '1',
  bandBatch: dev && query.get('qaBandBatch') === '1',
  joinedFinishDeferred: joinedFinishDeferredQaEnabled(dev, deferred, search),
  materialPresentation: false,
  diagnosticSolverBatch: dev && query.get('qaSolverBatch') === '1',
 }
}
