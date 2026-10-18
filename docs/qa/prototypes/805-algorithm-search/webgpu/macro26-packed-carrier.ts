import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import {create as createFine,type CoherentFineConfig} from './macro18-coherent-fine'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
/** Same exact integer model, compact aux and all fine carrier storage; no new dispatch. */
export function create(device:GPUDevice,size:number,config:CoherentFineConfig&{affinityBase?:number}={},options:FixedWetFineOptions={}){return createFine(device,size,config,{...options,initializer:initialIntegerDynamicFast,compactAux:true,compactCarrier:true,affinityBase:config.affinityBase})}
export const packedCarrierDefinitions=[{id:'wgsl-macro-packed-carrier-coherent-fine',label:'Связная мелкая бумага — компактные u16 носители',create,configs:[
 {steps:256,fineSteps:12,paperGain:3,affinityBase:1,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:1,affinityBase:128,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:1,affinityBase:64,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128}
]}]
