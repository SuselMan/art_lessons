import type { PencilEngineOptions } from '../../../engine'
import { joinedTouchQaEnabled } from './joinedTouchQa'
import { joinedFinishDeferredQaEnabled } from './joinedFinishDeferredQa'

/** Constructor flags only. Production values and existing explicit DEV opt-ins
 * stay identical; diagnostic selection does not own material or scheduling. */
export function watercolorQaOptions(dev: boolean, joined: unknown, deferred: string | undefined, search: string): Pick<PencilEngineOptions, 'diagnosticHoistedContactRaster' | 'diagnosticGlTiming' | 'diagnosticQueuedHistory' | 'asyncFinish' | 'joinedTouch' | 'joinedTouchSnapshotLease' | 'joinedTouchMixed' | 'bandBatch' | 'joinedFinishDeferred' | 'materialPresentation' | 'diagnosticWebgl2' | 'diagnosticBrushMrt' | 'diagnosticFrontBatch' | 'nativeWatercolor' | 'diagnosticPhysicalBatchTwo' | 'diagnosticSolverBatch' | 'diagnosticMomentTransport' | 'diagnosticMomentGpuAudit' | 'diagnosticMomentVector' | 'diagnosticTipContactA' | 'diagnosticAsyncCarryPressure' | 'diagnosticCarryHardwarePressure' | 'diagnosticRawCanvasWarmup' | 'diagnosticFirstLiveWarmup'> {
 const query = new URLSearchParams(search)
 const flag=(name:string)=>{
  if(!dev)return false
  const values=query.getAll(name)
  if(values.length>1||values.some(value=>value!=='0'&&value!=='1'))throw new Error(`Invalid watercolor QA flag ${name}`)
  return values[0]==='1'
 }
 const diagnosticHoistedContactRaster=flag('wcContactHoist')
 const diagnosticGlTiming=flag('wcGlTiming')
 const diagnosticPhysicalBatchTwo=flag('qaPhysicalBatchTwo')
 const diagnosticFirstLiveWarmup=flag('wcFirstLiveWarmup')
 const diagnosticRawCanvasWarmup=flag('wcRawCanvasWarmup')
 const diagnosticCarryHardwarePressure=flag('wcCarryHardwarePressure'),diagnosticAsyncCarryPressure=flag('wcAsyncCarryPressure')
 const diagnosticTipContactA=flag('wcTipA')
 const diagnosticMomentVector=flag('wcMomentVector')
 const diagnosticMomentGpuAudit=flag('wcMomentGpuAudit')
 const nativeWatercolor=flag('wcNative'),diagnosticMomentTransport=flag('wcMomentTransport')
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
 const joinedTouch = !dev || joinedTouchQaEnabled(dev, joined, search)
 const diagnosticQueuedHistory=flag('wcQueuedHistory')
 if(diagnosticQueuedHistory&&(nativeWatercolor||query.get('qaJoinedTouchMixed')==='1'||joinedFinishDeferredQaEnabled(dev,deferred,search)))throw new Error('wcQueuedHistory requires ordinary product-model arm')
 const joinedTouchSnapshotLease=flag('wcMixedLease')
 if(joinedTouchSnapshotLease&&!joinedTouch)throw new Error('wcMixedLease requires qaJoinedTouch=1')
 if(joinedTouchSnapshotLease&&(nativeWatercolor||query.get('qaJoinedTouchMixed')==='1'||joinedFinishDeferredQaEnabled(dev,deferred,search)))throw new Error('wcMixedLease requires separate product-model arm without native/mixed/deferred')
 if(diagnosticGlTiming&&(nativeWatercolor||query.get('qaJoinedTouchMixed')==='1'||joinedFinishDeferredQaEnabled(dev,deferred,search)))throw new Error('wcGlTiming requires ordinary synchronous GL arm')
 if(diagnosticHoistedContactRaster&&(nativeWatercolor||query.get('qaJoinedTouchMixed')==='1'||joinedFinishDeferredQaEnabled(dev,deferred,search)))throw new Error('wcContactHoist requires ordinary synchronous GL arm')
 return {
  diagnosticHoistedContactRaster,diagnosticGlTiming,diagnosticPhysicalBatchTwo,diagnosticFirstLiveWarmup,diagnosticRawCanvasWarmup,diagnosticAsyncCarryPressure,diagnosticCarryHardwarePressure,diagnosticTipContactA,nativeWatercolor,diagnosticMomentTransport,diagnosticMomentGpuAudit,diagnosticMomentVector,diagnosticWebgl2,diagnosticBrushMrt,diagnosticFrontBatch,
  diagnosticQueuedHistory,asyncFinish: false,
  joinedTouch,joinedTouchSnapshotLease,
  joinedTouchMixed: dev && query.get('qaJoinedTouchMixed') === '1',
  bandBatch: dev && query.get('qaBandBatch') === '1',
  joinedFinishDeferred: joinedFinishDeferredQaEnabled(dev, deferred, search),
  materialPresentation: false,
  diagnosticSolverBatch: dev && query.get('qaSolverBatch') === '1',
 }
}
