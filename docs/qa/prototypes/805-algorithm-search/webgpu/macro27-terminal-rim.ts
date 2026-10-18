import {create as createFine} from './macro11-fine-paper'
import {MACRO17_SMOOTH_FINE_INIT,MACRO17_SMOOTH_FINE_PACK} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {coherentSource} from './macro14-coherent-source'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
import type {CoherentFineConfig} from './macro18-coherent-fine'
function once(source:string,anchor:string,replacement:string){if(source.split(anchor).length!==2)throw Error('Terminal rim source drift');return source.replace(anchor,replacement)}
/** Final water level set, not an exact distance transform. No additional texture or dispatch. */
export function terminalRimInit(strength:number,threshold=64):string{
 integerOption(strength,0,256,'rimStrength');integerOption(threshold,1,16384,'rimThreshold')
 const helper=`
fn rimWater(q:vec2i)->f32{let xy=vec2u(clamp(q,vec2i(0),vec2i(i32(p.n)-1)));let cell=coarse[xy.y*p.n+xy.x];return f32(cell.w+cell.s);}
fn terminalAffinity(gid:vec2u)->u32{
 let numer=vec2i(gid)*2+vec2i(-7);let base=vec2i(floor16(numer.x),floor16(numer.y));let t=vec2f(numer-base*16)/16.0;
 let a=rimWater(base);let b=rimWater(base+vec2i(1,0));let c=rimWater(base+vec2i(0,1));let d=rimWater(base+vec2i(1,1));let threshold=${threshold}.0;
 if(min(min(a,b),min(c,d))>=threshold||max(max(a,b),max(c,d))<threshold){return 64u;}
 let value=mix(mix(a,b,t.x),mix(c,d,t.x),t.y);
 let gx=mix(b-a,d-c,t.y)/8.0;let gy=mix(c-a,d-b,t.x)/8.0;
 let hi=max(abs(gx),abs(gy));let lo=min(abs(gx),abs(gy));let gradient=hi+0.375*lo;
 if(gradient<=0.0||value<=threshold){return 64u;}
 let distance=(value-threshold)/gradient;
 var profile=0.0;if(distance<2.0){profile=distance/2.0;}else if(distance<8.0){profile=(8.0-distance)/6.0;}
 return 64u+u32(floor(clamp(profile,0.0,1.0)*${strength}.0*0.75));
}
`
 // Zero control avoids floating work entirely; uniform64 has exactly the same pair exchange as uniform1.
 const source=strength===0?MACRO17_SMOOTH_FINE_INIT:once(MACRO17_SMOOTH_FINE_INIT,'@compute ',helper+'@compute ')
 return once(source,'1u+(255u-paper[i])*p.gain/4u',strength===0?'64u+(255u-paper[i])*p.gain/4u':'terminalAffinity(gid.xy)+(255u-paper[i])*p.gain/4u')
}
export interface TerminalRimConfig extends CoherentFineConfig {rimStrength?:number;rimThreshold?:number}
export async function create(device:GPUDevice,size:number,config:TerminalRimConfig={}):Promise<Candidate>{
 const rimStrength=integerOption(config.rimStrength??128,0,256,'rimStrength'),rimThreshold=integerOption(config.rimThreshold??64,1,16384,'rimThreshold')
 const mobilityGain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddyCells=integerOption(config.eddyCells??16,4,64,'eddyCells'),curlStrength=integerOption(config.curlStrength??128,0,128,'curlStrength')
 if(config.paperGain!==undefined&&config.paperGain!==0)throw Error('Terminal rim isolates edge affinity: paperGain must be0')
 const base=await createFine(device,size,{...config,paperGain:0},{initSourceOverride:terminalRimInit(rimStrength,rimThreshold),packSourceOverride:MACRO17_SMOOTH_FINE_PACK,fineDepositPlane:true,smoothInitialization:true,basePairSourceOverride:coherentSource(mobilityGain),baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain,eddyCells,curlStrength},{...o,initializer:initialIntegerDynamicFast})})
 return{get metadata(){return{...base.metadata,basePhysicalModel:'actual coherent advection; original coarse PACK; fast exact initializer',terminalRim:{strength:rimStrength,threshold:rimThreshold,affinityMin:64,affinityMax:64+Math.floor(rimStrength*.75),paperGain:0,waterGate:'unchanged nearest final W+S>0',profile:'bilinear final W+S threshold-crossing cells; analytic approximate distance; peak2px, tail8px',horizon:'12 phases at most6px per axis; cannot collect remote pigment',qualification:'NEW local conservative terminal redistribution, not whole-wash native rim equivalence or true SDF; float affinity is not crossGPU-certified'},optimizationScope:'No extra GPU allocation/dispatch over scalar smooth fine. Four extra coarse water samples per fine pixel when strength>0.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const terminalRimDefinitions=[{id:'wgsl-macro-terminal-rim-coherent-fine',label:'Локальная кромка после растекания — опытный вариант',create,configs:[0,128].map(rimStrength=>({steps:256,fineSteps:12,paperGain:0,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128,rimThreshold:64,rimStrength}))}]
