import {partitionNativeComponents,type NativeComponentPlanes} from './native-component-partition'
import {createNativeComponentMerge,type NativeMergeMapping} from './native-component-merge'
type Merge=Pick<ReturnType<typeof createNativeComponentMerge>,'begin'|'merge'|'dependency'|'readback'|'destroy'> & {metadata?:unknown}
export interface NativeComponentTimedOptions {
 gl:WebGLRenderingContext;size:number;original:NativeComponentPlanes;baseCommonRGBA:Uint8Array;mapping:NativeMergeMapping
 /** Actual forkNativeComponent(engine, controller.diagnosticSource(), planes). */
 fork:(planes:NativeComponentPlanes)=>{source:unknown;destroy():void}
 withSource:<T>(source:unknown,work:()=>T)=>T
 withPaper:<T>(work:()=>T)=>T
 /** Actual controller.diagnosticRunCore(): reset/step/dry, NO present/read/hash. */
 runCore:()=>{c:{texture:WebGLTexture}}
 now?:()=>number
 createMerge?:(gl:WebGLRenderingContext,w:number,h:number,options:NativeMergeMapping&{baseCommonRGBA:Uint8Array})=>Merge
 digest?:(pixels:Uint8Array)=>Promise<string>
}
/** QA timer orchestration only. Actual original seven planes are acquired/proved by caller
 * BEFORE entry. Never calls diagnosticRunGoal/PresentGoal or per-component readback/hash. */
export async function runNativeComponentTimed(options:NativeComponentTimedOptions){
 const now=options.now??(()=>performance.now()),digest=options.digest??(async(pixels:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(pixels))),b=>b.toString(16).padStart(2,'0')).join(''))
 const setupStart=now(),merge=(options.createMerge??createNativeComponentMerge)(options.gl,options.size,options.size,{...options.mapping,baseCommonRGBA:options.baseCommonRGBA})
 try{
  // Drain owned base/resource upload outside both primary intervals. Primary begins
  // with another real base copy. No native source/proof reads are performed here.
  merge.begin();merge.dependency();const setupReady=now()
  const totalStart=now(),partition=partitionNativeComponents(options.original,options.size,options.size)
  const components:{id:number;pixelCount:number;pigmented:boolean;computeReadyMs:number}[]=[]
  let computeReadyMs=0,probe:Uint8Array|undefined
  merge.begin({uploadBase:true})
  for(const component of partition.components){
   const selected=partition.materialize(component.id),fork=options.fork(selected.planes)
   try{
    const computeStart=now();let computeEnd:number|undefined
    options.withPaper(()=>options.withSource(fork.source,()=>{
     const buffers=options.runCore();merge.merge(buffers.c.texture,selected.mask);probe=merge.dependency();computeEnd=now()
    }))
    if(computeEnd===undefined||computeEnd<computeStart)throw Error('Invalid native compute timer')
    const elapsed=computeEnd-computeStart;computeReadyMs+=elapsed;components.push({id:component.id,pixelCount:component.pixelCount,pigmented:component.pigmented,computeReadyMs:elapsed})
   }finally{fork.destroy()}
  }
  if(partition.components.length===0)probe=merge.dependency()
  const totalEnd=now();if(totalEnd<totalStart||setupReady<setupStart)throw Error('Invalid native total timer')
  // Existing full read is outside dependent1px intervals but INCLUDED in full-output primary; hash remains outside all intervals.
  const fullReadStart=now(),output=merge.readback(),fullReadEnd=now(),outputSHA=await digest(output)
  return{output,outputSHA,components,partitionAudit:partition.partitionAudit,mergeMetadata:merge.metadata,
   sample:{fullReadbackMs:fullReadEnd-fullReadStart,totalToFullReadbackMs:fullReadEnd-totalStart,fullOutputBoundary:'preloaded original CPU planes and allocated merge resources → partition/materialize/fork upload/core/GPUmerge/full1024RGBA CPU readback; hash excluded; PRIMARY',inputFencePolicy:'none; no claim that CPU upload completion drains queued GPU work',totalReadyMs:totalEnd-totalStart,computeReadyMs,setupReadyMs:setupReady-setupStart,probeRGBA:Array.from(probe??[]),componentCount:components.length,
    primaryBoundary:'preloaded original CPU planes and allocated merge resources → partition/materialize/fork upload/core/merge/dependent1px ready common-C texture',
    computeBoundary:'sum per-component fork upload CPU returned → withPaper/source context + core-only reset/step/dry + merge/dependent1px; queued GPU upload work may remain',
    excluded:'source7 acquisition/proof, merge static allocation/initial preflight, full output read/hash, final merge destruction',
    qualification:'QA algorithm-stand timing, NOT pen-up/end-to-end latency or pure GPU timing. No gl.finish GPU-completion claim: affected Chromium implementation flushes only. Secondary computeReadyMs can include queued input-upload work; Use totalToFullReadbackMs as the full-output primary. totalReadyMs is only a one-pixel dependency and does not certify every tile. No cross-boundary speedup. Native paper texture is a preloaded room resource; worker paper-height upload scope differs. setupReadyMs reported separately.'}}
 }finally{merge.destroy()}
}
