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
