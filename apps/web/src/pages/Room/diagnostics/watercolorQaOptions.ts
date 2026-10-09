import type { PencilEngineOptions } from '../../../engine'
import { joinedTouchQaEnabled } from './joinedTouchQa'
import { joinedFinishDeferredQaEnabled } from './joinedFinishDeferredQa'

/** Constructor flags only. Production values and existing explicit DEV opt-ins
 * stay identical; diagnostic selection does not own material or scheduling. */
export function watercolorQaOptions(dev: boolean, joined: unknown, deferred: string | undefined, search: string): Pick<PencilEngineOptions, 'asyncFinish' | 'joinedTouch' | 'joinedTouchMixed' | 'bandBatch' | 'joinedFinishDeferred' | 'materialPresentation' | 'diagnosticWebgl2' | 'diagnosticBrushMrt' | 'diagnosticFrontBatch' | 'nativeWatercolor' | 'diagnosticPhysicalBatchTwo' | 'diagnosticSolverBatch' | 'diagnosticMomentTransport' | 'diagnosticMomentGpuAudit' | 'diagnosticMomentVector' | 'diagnosticTipContactA' | 'diagnosticNativeBrushPair' | 'diagnosticSourcePrecompile' | 'diagnosticAsyncObservedFields' | 'diagnosticAsyncCarryPressure' | 'diagnosticCarryHardwarePressure' | 'diagnosticRawCanvasWarmup' | 'diagnosticFirstLiveWarmup'> {
 const query = new URLSearchParams(search)
 const flag=(name:string)=>{
  if(!dev)return false
  const values=query.getAll(name)
  if(values.length>1||values.some(value=>value!=='0'&&value!=='1'))throw new Error(`Invalid watercolor QA flag ${name}`)
  return values[0]==='1'
 }
 const diagnosticPhysicalBatchTwo=flag('qaPhysicalBatchTwo')
 const diagnosticFirstLiveWarmup=flag('wcFirstLiveWarmup')
 const diagnosticRawCanvasWarmup=flag('wcRawCanvasWarmup')
 const diagnosticCarryHardwarePressure=flag('wcCarryHardwarePressure'),diagnosticAsyncCarryPressure=flag('wcAsyncCarryPressure')
 const diagnosticNativeBrushPair=flag('wcNativeBrushPair')
 const diagnosticSourcePrecompile=flag('wcSourcePrecompile')
 const diagnosticAsyncObservedFields=flag('wcAsyncObservedFields')
 const diagnosticTipContactA=flag('wcTipA')
 const diagnosticMomentVector=flag('wcMomentVector')
 const diagnosticMomentGpuAudit=flag('wcMomentGpuAudit')
 const nativeWatercolor=flag('wcNative'),diagnosticMomentTransport=flag('wcMomentTransport')
 if(diagnosticNativeBrushPair){if(!nativeWatercolor)throw Error('wcNativeBrushPair requires wcNative=1');for(const name of ['wcGl2','wcMrt','wcFrontBatch','qaJoinedFinishDeferred','qaJoinedTouchMixed','wcMixedLease','wcQueuedHistory','wcMomentTransport','wcMomentGpuAudit','wcMomentVector'])if(flag(name))throw Error('Separate native paired brush arm '+name)}
 if(diagnosticSourcePrecompile&&(!nativeWatercolor||diagnosticFirstLiveWarmup||diagnosticRawCanvasWarmup||diagnosticTipContactA))throw new Error('wcSourcePrecompile requires wcNative=1 and dispatch warm/tip flags OFF')
 if(diagnosticAsyncObservedFields&&!nativeWatercolor)throw new Error('wcAsyncObservedFields requires wcNative=1')
 if(diagnosticFirstLiveWarmup&&!nativeWatercolor)throw new Error('wcFirstLiveWarmup requires wcNative=1')
 if(diagnosticFirstLiveWarmup&&diagnosticRawCanvasWarmup)throw new Error('Separate first-live and raw-only warmup arms required')
 if(diagnosticRawCanvasWarmup&&!nativeWatercolor)throw new Error('wcRawCanvasWarmup requires wcNative=1')
 if(diagnosticAsyncCarryPressure&&(!nativeWatercolor||!diagnosticCarryHardwarePressure))throw new Error('wcAsyncCarryPressure requires wcNative=1 and wcCarryHardwarePressure=1')
 if(diagnosticCarryHardwarePressure&&!nativeWatercolor)throw new Error('wcCarryHardwarePressure requires wcNative=1')
 if(diagnosticTipContactA&&!nativeWatercolor)throw new Error('wcTipA requires wcNative=1')
 if(diagnosticMomentVector&&!diagnosticMomentGpuAudit)throw new Error('wcMomentVector requires wcMomentGpuAudit=1')
 if(diagnosticMomentGpuAudit&&!diagnosticMomentTransport)throw new Error('wcMomentGpuAudit requires wcMomentTransport=1')
 if(diagnosticMomentTransport&&!nativeWatercolor)throw new Error('wcMomentTransport requires wcNative=1; new physics DEV only')
 const diagnosticWebgl2=flag('wcGl2'),diagnosticBrushMrt=flag('wcMrt'),diagnosticFrontBatch=flag('wcFrontBatch')
 if(diagnosticBrushMrt&&!diagnosticWebgl2)throw new Error('wcMrt requires wcGl2=1')
 return {
  diagnosticNativeBrushPair,diagnosticSourcePrecompile,diagnosticAsyncObservedFields,diagnosticPhysicalBatchTwo,diagnosticFirstLiveWarmup,diagnosticRawCanvasWarmup,diagnosticAsyncCarryPressure,diagnosticCarryHardwarePressure,diagnosticTipContactA,nativeWatercolor,diagnosticMomentTransport,diagnosticMomentGpuAudit,diagnosticMomentVector,diagnosticWebgl2,diagnosticBrushMrt,diagnosticFrontBatch,
  asyncFinish: false,
  joinedTouch: !dev || joinedTouchQaEnabled(dev, joined, search),
  joinedTouchMixed: dev && query.get('qaJoinedTouchMixed') === '1',
  bandBatch: dev && query.get('qaBandBatch') === '1',
  joinedFinishDeferred: joinedFinishDeferredQaEnabled(dev, deferred, search),
  materialPresentation: false,
  diagnosticSolverBatch: dev && query.get('qaSolverBatch') === '1',
 }
}
