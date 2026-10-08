import type { PencilEngineOptions } from '../../../engine'
import { joinedTouchQaEnabled } from './joinedTouchQa'
import { joinedFinishDeferredQaEnabled } from './joinedFinishDeferredQa'

/** Constructor flags only. Production values and existing explicit DEV opt-ins
 * stay identical; diagnostic selection does not own material or scheduling. */
export function watercolorQaOptions(dev: boolean, joined: unknown, deferred: string | undefined, search: string): Pick<PencilEngineOptions, 'asyncFinish' | 'joinedTouch' | 'joinedTouchMixed' | 'bandBatch' | 'joinedFinishDeferred' | 'materialPresentation' | 'diagnosticWebgl2' | 'diagnosticBrushMrt' | 'diagnosticFrontBatch' | 'nativeWatercolor' | 'diagnosticSolverBatch' | 'diagnosticMomentTransport'> {
 const query = new URLSearchParams(search)
 const flag=(name:string)=>{
  if(!dev)return false
  const values=query.getAll(name)
  if(values.length>1||values.some(value=>value!=='0'&&value!=='1'))throw new Error(`Invalid watercolor QA flag ${name}`)
  return values[0]==='1'
 }
 const nativeWatercolor=flag('wcNative'),diagnosticMomentTransport=flag('wcMomentTransport')
 if(diagnosticMomentTransport&&!nativeWatercolor)throw new Error('wcMomentTransport requires wcNative=1; new physics DEV only')
 const diagnosticWebgl2=flag('wcGl2'),diagnosticBrushMrt=flag('wcMrt'),diagnosticFrontBatch=flag('wcFrontBatch')
 if(diagnosticBrushMrt&&!diagnosticWebgl2)throw new Error('wcMrt requires wcGl2=1')
 return {
  nativeWatercolor,diagnosticMomentTransport,diagnosticWebgl2,diagnosticBrushMrt,diagnosticFrontBatch,
  asyncFinish: false,
  joinedTouch: !dev || joinedTouchQaEnabled(dev, joined, search),
  joinedTouchMixed: dev && query.get('qaJoinedTouchMixed') === '1',
  bandBatch: dev && query.get('qaBandBatch') === '1',
  joinedFinishDeferred: joinedFinishDeferredQaEnabled(dev, deferred, search),
  materialPresentation: false,
  diagnosticSolverBatch: dev && query.get('qaSolverBatch') === '1',
 }
}
