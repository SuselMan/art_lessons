import {runNativeComponentTimed} from './native-component-timed'
import {forkNativeComponent} from './native-component-source'
import {captureNativePaperHeight} from '../805-algorithm-search/webgpu/native-capture-gl'
import type {NativeComponentPlanes} from './native-component-partition'
import type {NativeMergeMapping} from './native-component-merge'
/** Source acquisition and verification are outside the timed helper. QA owned engines only. */
export async function runNativeTimedGoal(engine:any,controller:any,withPaper:<T>(fn:()=>T)=>T,baseCommonRGBA:Uint8Array,mapping:NativeMergeMapping){
 const size=1024,anchor=controller.diagnosticSource(),ctx=engine._watercolorPasses.ctx
 const read=():NativeComponentPlanes=>{
  const out:Record<string,Uint8Array>={}
  for(const [key,buffer]of Object.entries({p:anchor.entry.inkLoad,c:anchor.entry.inkColor,coverage:anchor.entry.coverage,solvent:anchor.entry.solventLoad,foreign:anchor.entry.foreignSolventLoad,original:anchor.entry.original}))out[key]=buffer?(buffer as any).readPixels():new Uint8Array(size*size*4)
  out.paper=withPaper(()=>captureNativePaperHeight(engine.gl,ctx.paperTex(),size,[0,0],[ctx.paperWorldSize().w,ctx.paperWorldSize().h],ctx.paperScale()))
  return out as NativeComponentPlanes
 }
 const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('')
 const hashes=async(planes:NativeComponentPlanes)=>Object.fromEntries(await Promise.all(Object.entries(planes).map(async([k,v])=>[k,await digest(v)])))
 const metadata=()=>JSON.stringify(anchor.scratch.captureFinishMetadata(),(key,value)=>key==='target'?undefined:value)
 const original=read(),sourceSHA=await hashes(original),metadataBefore=metadata()
 const result=await runNativeComponentTimed({gl:engine.gl,size,original,baseCommonRGBA,mapping,fork:planes=>forkNativeComponent(engine,anchor,planes),withPaper,withSource:(source,fn)=>controller.diagnosticWithSource(source,fn),runCore:()=>controller.diagnosticRunCore()})
 const sourceSHAAfter=await hashes(read())
 for(const key in sourceSHA)if(sourceSHA[key]!==sourceSHAAfter[key])throw Error('Timed component source changed '+key)
 if(metadata()!==metadataBefore)throw Error('Timed component metadata changed')
 return{...result,sourceSHA,sourceSHAAfter,sourceUnchanged:true,metadataSHA:await digest(new TextEncoder().encode(metadataBefore))}
}
