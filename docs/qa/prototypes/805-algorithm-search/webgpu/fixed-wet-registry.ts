import {create as createCapillary4} from './macro4-capillary'
import {create as createCapillarySmooth5} from './macro5-capillary-smooth'
import {create as createCapillaryDither6} from './macro6-capillary-dither'
import {createFixedLBM} from './lbm-fixed'
import {create as createFront12} from './macro12-front-adsorption'
import {create as createMobility13} from './macro13-mobility-calibration'
import {create as createSafe15} from './macro15-safe-integer-dither'
import {create as createSafeFine16,createMobility as createMobilityFine16} from './macro16-safe-fine-paper'
import {create as createCoherentFine18} from './macro18-coherent-fine'
import {create as createDither19} from './macro19-coherent-dither'
import {create as createFast21} from './macro21-fast-coherent'
import {create as createFastFine22} from './macro22-fast-coherent-fine'
import {create as createSoft23} from './macro23-soft-paper-coherent-fine'
import {create as createAux24} from './macro24-packed-aux'
import {create as createGated25} from './macro25-gated-exchange'
import {create as createPacked26} from './macro26-packed-carrier'
import {create as createRim27} from './macro27-terminal-rim'
import {create as createLimited28} from './macro28-limited-advection'
import {create as createTrueFine29} from './macro29-true-coherent-fine'
import {create as createPressure32,createFine as createPressureFine32} from './macro32-bounded-pressure'
import {create as createDetail35} from './macro35-source-detail-fine'
import {create as createCurl37,createFine as createCurlFine37} from './macro37-relaxed-curl'
import {create as createCoalesced38,createFine as createCoalescedFine38} from './macro38-coalesced-single-pair'
import {create as createGpuFine39} from './macro39-gpu-initial-fine'
import {create as createExact40} from './macro40-current-exact-search'
import {create as createCapacityLite41} from './macro41-capacity-aware-lite'
import {createFine42,createLite43} from './macro42-gpu-capacity-aware'
import {make as createWetness10} from './macro10-wetness'
import type {Definition} from './index'
import type {Candidate} from './contract'
import {create as createFine} from './macro11-fine-paper'
import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createBase8} from './macro8-integer-dynamic'
import {create as createBase9} from './macro9-integer-smooth'
import {create as createBase14,type CoherentOverrides} from './macro14-coherent-advection'
import {create as createDt} from './macro30-physical-dt'
import {create as createSingle,createFine as createSingleFine} from './macro33-single-pair-dt'
import {create as createGpu} from './macro34-gpu-initial'
import {create as createDtFine} from './macro31-physical-dt-fine'
import {create as createCapacityFine} from './macro36-capacity-aware-fine'
import {createFixedWetFineHooks} from './fixed-wet-fine-hooks'
type Config=Record<string,number>
type Base=(d:GPUDevice,s:number,c:Config,o:Pick<CoherentOverrides,'fixedWet'|'observePacking'>)=>Promise<Candidate>
/** Explicit selected actual factory; no shader interception, hidden scope or fallback to B-lite physics. */
function lite(d:GPUDevice,s:number,c:Config,steps:number,base:Base){return createFine(d,s,{steps,fineSteps:0,paperGain:0,dither:0},{fixedWet:createFixedWetFineHooks(),compactAux:true,compactCarrier:true,baseFactory:(device,size,_cfg,o)=>base(device,size,c,{fixedWet:o?.fixedWet,observePacking:o?.observePacking})})}
export function attachFixedWetFactories(definitions:Definition[]){
 const table:Record<string,NonNullable<Definition['createFixedInitialWet']>>={
 'wgsl-d2q9-bgk':createFixedLBM,
 'wgsl-macro-dynamic-wetness':(d,s,c)=>createCapillary4(d,s,c,undefined,{fixedInitialWet:true}),
 'wgsl-macro-dynamic-wetness-smooth':(d,s,c)=>createCapillarySmooth5(d,s,c,{fixedInitialWet:true}),
 'wgsl-macro-dynamic-wetness-smooth-dither':(d,s,c)=>createCapillaryDither6(d,s,c,{fixedInitialWet:true}),
 'wgsl-macro-wetting-front-deposition':(d,s,c)=>lite(d,s,c,c.steps??128,createFront12),
 'wgsl-macro-mobility-calibration':(d,s,c)=>lite(d,s,c,c.steps??128,createMobility13),
 'wgsl-macro-integer-smooth-safe-dither':(d,s,c)=>lite(d,s,c,c.steps??128,createSafe15),
 'wgsl-macro-coherent-safe-dither':(d,s,c)=>lite(d,s,c,c.steps??256,createDither19),
 'wgsl-macro-coherent-fast-initial':(d,s,c)=>lite(d,s,c,c.steps??256,createFast21),
 'wgsl-macro-coherent-gated-exchange':(d,s,c)=>lite(d,s,c,c.steps??256,createGated25),
 'wgsl-macro-limited-coherent-advection':(d,s,c)=>lite(d,s,c,c.steps??256,createLimited28),
 'wgsl-macro-bounded-pressure-dt':(d,s,c)=>lite(d,s,c,256/(c.physicalDt??4),createPressure32),
 'wgsl-macro-relaxed-curl-dt':(d,s,c)=>lite(d,s,c,256/(c.physicalDt??4),createCurl37),
 'wgsl-macro-coalesced-single-pair-dt':(d,s,c)=>lite(d,s,c,64,createCoalesced38),
 'wgsl-macro-current-exact-program':(d,s,c)=>lite(d,s,c,64,createExact40),
 'wgsl-macro-capacity-aware-lite':(d,s,c)=>lite(d,s,c,64,createCapacityLite41),
 'wgsl-macro-gpu-capacity-aware-lite':(d,s,c)=>lite(d,s,c,64,createLite43),
 'wgsl-macro-integer-safe-fine-paper':(d,s,c)=>createSafeFine16(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-mobility-safe-fine-paper':(d,s,c)=>createMobilityFine16(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-coherent-smooth-fine-paper':(d,s,c)=>createCoherentFine18(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-fast-coherent-smooth-fine-paper':(d,s,c)=>createFastFine22(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-soft-paper-coherent-fine':(d,s,c)=>createSoft23(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-packed-aux-coherent-fine':(d,s,c)=>createAux24(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-packed-carrier-coherent-fine':(d,s,c)=>createPacked26(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-terminal-rim-coherent-fine':(d,s,c)=>createRim27(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-true-coherent-fine':(d,s,c)=>createTrueFine29(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-bounded-pressure-dt-fine':(d,s,c)=>createPressureFine32(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-source-detail-fine':(d,s,c)=>createDetail35(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-relaxed-curl-dt-fine':(d,s,c)=>createCurlFine37(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-coalesced-single-pair-dt-fine':(d,s,c)=>createCoalescedFine38(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-gpu-initial-fine':(d,s,c)=>createGpuFine39(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-gpu-capacity-aware-fine':(d,s,c)=>createFine42(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-local-smooth-control':(d,s,c)=>lite(d,s,c,c.steps??128,(dev,size,cfg,o)=>createWetness10(dev,size,cfg,false,o)),
 'wgsl-macro-wetness-conductance':(d,s,c)=>lite(d,s,c,c.steps??128,(dev,size,cfg,o)=>createWetness10(dev,size,cfg,true,o)),
 'wgsl-macro-integer-dynamic':(d,s,c)=>lite(d,s,c,c.steps??128,createBase8),
 'wgsl-macro-integer-smooth-control':(d,s,c)=>lite(d,s,{...c,mixing:0},c.steps??128,createBase9),
 'wgsl-macro-integer-mixing-smooth':(d,s,c)=>lite(d,s,c,c.steps??128,createBase9),
 'wgsl-macro-coherent-advection':(d,s,c)=>lite(d,s,c,c.steps??256,createBase14),
 'wgsl-macro-coherent-physical-dt':(d,s,c)=>lite(d,s,c,256/(c.physicalDt??1),createDt),
 'wgsl-macro-single-pair-dt':(d,s,c)=>lite(d,s,c,64,createSingle),
 'wgsl-macro-gpu-initial-coherent-dt4':(d,s,c)=>lite(d,s,c,64,createGpu),
 'wgsl-macro-integer-fine-paper':(d,s,c)=>createFine(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-mobility-smooth-fine-paper':(d,s,c)=>createSmoothFine(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-physical-dt-fine':(d,s,c)=>createDtFine(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-capacity-aware-fine':(d,s,c)=>createCapacityFine(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 'wgsl-macro-single-pair-dt-fine':(d,s,c)=>createSingleFine(d,s,c,{fixedWet:createFixedWetFineHooks()}),
 }
 for(const definition of definitions){const factory=table[definition.id];if(factory)definition.createFixedInitialWet=factory}
}
