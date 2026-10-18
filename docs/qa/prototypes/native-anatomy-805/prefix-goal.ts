import {measureAnatomyPrefix} from './capture'
import {partitionNativeComponents,type NativeComponentPlanes} from '../mini-worker/native-component-partition'
import {forkNativeComponent} from '../mini-worker/native-component-source'
import {captureNativePaperHeight} from '../805-algorithm-search/webgpu/native-capture-gl'
/** Single fresh owned-context semantic prefix; preparation and proof outside interval. */
export async function runNativeAnatomyPrefix(engine:any,controller:any,selection:{stage:string;occurrence:number;role:string;component:number}){
 const size=1024,anchor=controller.diagnosticSource(),ctx=engine._watercolorPasses.ctx,read=()=>{const p:Record<string,Uint8Array>={};for(const[k,b]of Object.entries({p:anchor.entry.inkLoad,c:anchor.entry.inkColor,coverage:anchor.entry.coverage,solvent:anchor.entry.solventLoad,foreign:anchor.entry.foreignSolventLoad,original:anchor.entry.original}))p[k]=b?(b as any).readPixels():new Uint8Array(size*size*4);p.paper=captureNativePaperHeight(engine.gl,ctx.paperTex(),size,[0,0],[ctx.paperWorldSize().w,ctx.paperWorldSize().h],ctx.paperScale());return p as NativeComponentPlanes}
 const digest=async(a:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a))),b=>b.toString(16).padStart(2,'0')).join(''),hashes=async(p:NativeComponentPlanes)=>Object.fromEntries(await Promise.all(Object.entries(p).map(async([k,v])=>[k,await digest(v)])))
 const original=read(),sourceSHA=await hashes(original),partition=partitionNativeComponents(original,size,size),component=partition.components[selection.component];if(!component)throw Error('Prefix component absent')
 const selected=partition.materialize(component.id),fork=forkNativeComponent(engine,anchor,selected.planes)
 try{const result=controller.diagnosticWithSource(fork.source,()=>measureAnatomyPrefix({gl:engine.gl,...selection,execute:()=>controller.diagnosticRunCore(),cleanup:()=>controller.diagnosticCancelCore()}));const sourceSHAAfter=await hashes(read());for(const k in sourceSHA)if(sourceSHA[k]!==sourceSHAAfter[k])throw Error('Prefix source changed '+k);return{...result,sourceSHA,sourceSHAAfter,sourceUnchanged:true,component:{id:component.id,pixelCount:component.pixelCount,pigmented:component.pigmented},qualification:'CPU fork upload returned → selected semantic producer + ONE actual full-plane CPU read. Outstanding GPU input-upload work may remain; no prepared-GPU or additive stage-time claim. Partition/fork/proofs/exception cleanup outside prefix interval.'}}
 finally{fork.destroy()}
}
