import {strongConfigKeys} from '../config-integrity'
import {packedCarrierDefinitions} from './macro26-packed-carrier'
import {terminalRimDefinitions} from './macro27-terminal-rim'
import {limitedAdvectionDefinitions} from './macro28-limited-advection'
import {trueCoherentFineDefinitions} from './macro29-true-coherent-fine'
import {gatedExchangeDefinitions} from './macro25-gated-exchange'
import {packedAuxDefinitions} from './macro24-packed-aux'
import {softPaperDefinitions} from './macro23-soft-paper-coherent-fine'
import {fastCoherentFineDefinitions} from './macro22-fast-coherent-fine'
import {fastCoherentDefinitions} from './macro21-fast-coherent'
import {coherentDitherDefinitions} from './macro19-coherent-dither'
import {coherentFineDefinitions} from './macro18-coherent-fine'
import {coherentDefinitions} from './macro14-coherent-advection'
import {safeFineDefinitions} from './macro16-safe-fine-paper'
import {smoothFineDefinitions} from './macro17-smooth-fine-paper'
import {mobilityDefinitions} from './macro13-mobility-calibration'
import {safeIntegerDitherDefinitions} from './macro15-safe-integer-dither'
import {frontAdsorptionDefinitions} from './macro12-front-adsorption'
import {moduloProbeDefinitions} from './integer-modulo-probe'
import {fineIntegerDefinitions} from './macro11-fine-paper'
import {wetnessDefinitions} from './macro10-wetness'
import {integerDitherDefinitions} from './macro10-integer-dither'
import {exactFusedDefinitions} from './macro10-exact-fused'
import {exactProgramDefinitions} from './exact-program'
import {integerSmoothDefinitions} from './macro9-integer-smooth'
import {integerDynamicDefinitions} from './macro8-integer-dynamic'
import {ditherCapillaryDefinitions} from './macro6-capillary-dither'
import {integerHydraulicDefinitions} from './macro6-integer-hydraulic'
import {smoothCapillaryDefinitions} from './macro5-capillary-smooth'
import {curlDefinitions} from './macro5-curl'
import {capillaryDefinitions} from './macro4-capillary'
import {safeParticleDefinitions} from './macro4-particles-safe'
import {finePaperDefinitions} from './macro3-fine-paper'
import {compactParticleDefinitions} from './macro3-particles-compact'
import {macro2Definitions} from './macro2-sorption'
import {particleDefinitions} from './macro2-particles'
import {macroDefinitions} from './macro-registry'
import type {AlgorithmConfig} from '../protocol'
import type {Candidate} from './contract'
import {create as diffusion} from './diffusion'
import {create as lbm} from './lbm'
import {create as glDiffusion} from './gl-diffusion'
import {create as textureDiffusion} from './diffusion-texture'
export interface Definition {configKeys?:readonly string[];id:string;label:string;configs:Record<string,number|boolean|undefined>[];create(device:GPUDevice,size:number,config:AlgorithmConfig):Promise<Candidate>}
export const definitions:Definition[]=[
 ...macroDefinitions,...macro2Definitions,...particleDefinitions,...finePaperDefinitions,...compactParticleDefinitions,...safeParticleDefinitions,...capillaryDefinitions,...integerHydraulicDefinitions,...smoothCapillaryDefinitions,...curlDefinitions,...integerDynamicDefinitions,...ditherCapillaryDefinitions,...integerSmoothDefinitions,...exactProgramDefinitions,...exactFusedDefinitions,...integerDitherDefinitions,...wetnessDefinitions,...fineIntegerDefinitions,...moduloProbeDefinitions,...frontAdsorptionDefinitions,...mobilityDefinitions,...safeIntegerDitherDefinitions,...safeFineDefinitions,...smoothFineDefinitions,...coherentDefinitions,...coherentFineDefinitions,...coherentDitherDefinitions,...fastCoherentDefinitions,...fastCoherentFineDefinitions,...softPaperDefinitions,...packedAuxDefinitions,...gatedExchangeDefinitions,...packedCarrierDefinitions,...terminalRimDefinitions,...limitedAdvectionDefinitions,...trueCoherentFineDefinitions,
 {id:'wgsl-integer-diffusion-direct',label:'WebGPU: local integer diffusion',configs:[{iterations:32,rate:24}],create:(d,s,c)=>diffusion(d,s,{...c,tiled:false})},
 {id:'wgsl-integer-diffusion-tiled4',label:'WebGPU: same local diffusion, four shared-memory steps',configs:[{iterations:32,rate:24}],create:(d,s,c)=>diffusion(d,s,{...c,tiled:true})},
 {id:'wgsl-d2q9-bgk',label:'WebGPU: D2Q9 fluid with pigment/water tracers',configs:[{grid:256,steps:48},{grid:512,steps:48},{grid:256,steps:16,diffusion:0.015},{grid:128,steps:24,diffusion:0.025}],create:lbm},
 {id:'wgsl-integer-diffusion-texture',label:'WebGPU: same local integer diffusion, R32Uint texture access',configs:[{iterations:32,rate:24}],create:textureDiffusion},
]
// Attach contracts only at the public registry boundary, never inside composed factories.
for(const definition of definitions){const keys=strongConfigKeys[definition.id];if(keys)definition.configKeys=keys}
export const glDefinitions=[{id:'gl-integer-diffusion-match',label:'GL1: matched local integer diffusion',configs:[{iterations:32,rate:24}],create:glDiffusion}]
