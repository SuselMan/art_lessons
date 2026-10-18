import {partitionNativeComponents,type NativeComponentPlanes} from './native-component-partition'
import {forkNativeComponent} from './native-component-source'
import {captureNativePaperHeight} from '../805-algorithm-search/webgpu/native-capture-gl'
const hash=async(a:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a as Uint8Array<ArrayBuffer>)),x=>x.toString(16).padStart(2,'0')).join('')
const metadata=(scratch:any)=>{const m=scratch.captureFinishMetadata();return{...m,paints:[...m.paints],finish:m.finish?{...m.finish,target:undefined}:null,dryCtx:m.dryCtx?{...m.dryCtx,target:undefined}:null}}
const hashes=async(p:Record<string,Uint8Array>)=>Object.fromEntries(await Promise.all(Object.entries(p).map(async([k,v])=>[k,await hash(v)])))
export async function runNativeComponentGoal(engine:any,controller:any,withPaper:<T>(fn:()=>T)=>T,progress:(event:any)=>void=()=>{},expectedSourceSHA?:Record<string,string>,inspectOnly=false,exportSourceEvidence=false){
 const size=1024,n=size*size,anchor=controller.diagnosticSource(),ctx=engine._watercolorPasses.ctx
 const read=(entry:any):NativeComponentPlanes=>{
  const out:Record<string,Uint8Array>={};for(const[k,b]of Object.entries({p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage,solvent:entry.solventLoad,foreign:entry.foreignSolventLoad,original:entry.original}))out[k]=b?(b as any).readPixels():new Uint8Array(n*4)
  out.paper=withPaper(()=>captureNativePaperHeight(engine.gl,ctx.paperTex(),size,[0,0],[ctx.paperWorldSize().w,ctx.paperWorldSize().h],ctx.paperScale()));return out as NativeComponentPlanes
 }
 const sourcePlanePresence=Object.fromEntries(Object.entries({p:anchor.entry.inkLoad,c:anchor.entry.inkColor,coverage:anchor.entry.coverage,solvent:anchor.entry.solventLoad,foreign:anchor.entry.foreignSolventLoad,original:anchor.entry.original}).map(([k,v])=>[k,!!v]));const originalMetadata=metadata(anchor.scratch),metadataSHA=await hash(new TextEncoder().encode(JSON.stringify(originalMetadata))),original=read(anchor.entry),sourceSHA=await hashes(original),partition=partitionNativeComponents(original,size,size),dry=partition.dryLiteral(),merged={p:dry.p,c:dry.c,coverage:dry.coverage},components=[]
 progress({phase:'partition',sourceSHA,componentCount:partition.components.length,firstComponents:partition.components.slice(0,8),epoch:performance.timeOrigin+performance.now()});if(expectedSourceSHA)for(const k of Object.keys(expectedSourceSHA))if(sourceSHA[k]!==expectedSourceSHA[k])throw Error('Partition source differs from seeded readback '+k);if(inspectOnly){const descriptors=[];for(const c of partition.components)descriptors.push(await partition.describe(c.id,sourceSHA));return{buffers:{p:original.p,c:original.c,coverage:original.coverage},hashes:await hashes({p:original.p,c:original.c,coverage:original.coverage}),proof:{policy:'native-component-isolated-v1',inspectOnly:true,partitionAudit:partition.partitionAudit,sourceSHA,sourceSHAAfter:sourceSHA,sourceUnchanged:true,components:descriptors,actualGoalRuns:0,waterOnlyRuns:0,dryChanged:0,componentLoopMs:0}}}const started=performance.now()
 for(const component of partition.components){
  const mark=(phase:string)=>progress({phase,component:component.id,pigmented:component.pigmented,epoch:performance.timeOrigin+performance.now()});mark('materialize')
  const selected=partition.materialize(component.id),expected=await partition.describe(component.id,sourceSHA),fork=forkNativeComponent(engine,anchor,selected.planes)
  try{
   mark('read-source');const actualMetadataSHA=await hash(new TextEncoder().encode(JSON.stringify(metadata(fork.source))));if(actualMetadataSHA!==metadataSHA)throw Error('Component finish/profile/palette metadata changed');const actual=read(fork.entry),actualSHA=await hashes(actual)
   for(const k of Object.keys(expected.maskedPlaneSHA))if(actualSHA[k]!==expected.maskedPlaneSHA[k as keyof NativeComponentPlanes])throw Error('Component source readback mismatch '+k)
   mark('source-verified');let result:any,output:any
   withPaper(()=>controller.diagnosticWithSource(fork.source,()=>{mark('native-run-start');result=controller.diagnosticRunGoal();mark('native-run-end');output=controller.diagnosticGoalReadback();mark('endpoint-read-end')}))
   let outsideMaterialNonzero=0,zeroCOutputNonzero=0
   for(let i=0;i<n;i++)for(let ch=0;ch<4;ch++){
    const j=i*4+ch
    if(!selected.mask[i]){if(output.p[j]||output.c[j])outsideMaterialNonzero++}
    else{merged.p[j]=output.p[j];merged.c[j]=output.c[j];merged.coverage[j]=output.coverage[j]}
    if(!component.pigmented&&output.c[j])zeroCOutputNonzero++
   }
   if(outsideMaterialNonzero)throw Error('Component endpoint outside material '+outsideMaterialNonzero)
   if(zeroCOutputNonzero)throw Error('Zero-C native component generated pigment '+zeroCOutputNonzero)
   mark('merge-end');components.push({...expected,metadataSHA,actualMetadataSHA,metadataExact:true,actualPlaneSHA:actualSHA,sourceReadbackExact:true,outsideMaterialNonzero,zeroCOutputNonzero,sample:result,endpointSHA:await hashes(output)})
  }finally{fork.destroy()}
 }
 const componentLoopMs=performance.now()-started,sourceSHAAfter=await hashes(read(anchor.entry));for(const k in sourceSHA)if(sourceSHAAfter[k]!==sourceSHA[k])throw Error('Component loop changed original '+k)
 let dryChanged=0;for(let i=0;i<n;i++)if(original.solvent[i*4+3]+original.foreign[i*4+3]===0)for(let ch=0;ch<4;ch++)if(merged.c[i*4+ch]!==original.c[i*4+ch])dryChanged++
 if(dryChanged)throw Error('Merged dry literal changed')
 const planeOrder=['p','c','coverage','solvent','foreign','original','paper'];const sourceEvidenceBlob=exportSourceEvidence?await new Response(new Blob(planeOrder.map(k=>original[k as keyof NativeComponentPlanes].buffer as ArrayBuffer)).stream().pipeThrough(new CompressionStream('gzip'))).blob():undefined;return{buffers:merged,hashes:await hashes(merged),sourceEvidenceBlob,sourceEvidenceMetadata:{planeOrder,planeBytes:n*4,planeSHA:sourceSHA,sourcePlanePresence,foreignKind:sourcePlanePresence.foreign?'actual-texture':'absent-logical-zero',rows:'gl-bottom-up',paper:'actual sampled shader paper; unchanged world context',qualification:'Already independently read source arrays reused after all primary timers; no extra GPU reads'},proof:{policy:'native-component-isolated-v1',connectivity:4,partitionAudit:partition.partitionAudit,metadataSHA,profile:originalMetadata.finish?.profile,palette:originalMetadata.paints,actualGoalRuns:components.length,waterOnlyRuns:partition.components.filter(c=>!c.pigmented).length,sourceSHA,sourceSHAAfter,sourceUnchanged:true,components,pigmentedComponents:partition.components.filter(c=>c.pigmented).length,waterOnlyComponents:partition.components.filter(c=>!c.pigmented).length,zeroCPolicy:'executed and independently checked; no unproven skip',dryChanged,componentLoopMs,qualification:'Native core unchanged; actual material/profile/palette fork per original wet component. Component loop includes uploads/readbacks/merge. No guarantee against shortcuts within a single connected component. Common compositor required; last native canvas is not merged-scene output.'}}
}
