import {captureNativePaperHeight} from '../805-algorithm-search/webgpu/native-capture-gl'
/** Native Mini's actual direct GPU source path. No CPU partition, materialization or component forks.
 * Source acquisition/proofs and P/coverage hashes are deliberately outside the primary interval. */
export async function runNativeDirectTimed(engine:any,controller:any,withPaper:<T>(work:()=>T)=>T){
 const anchor=controller.diagnosticSource(),size=1024,ctx=engine._watercolorPasses.ctx
 const digest=async(a:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a))),b=>b.toString(16).padStart(2,'0')).join('')
 const hashes=async(a:Record<string,Uint8Array>)=>Object.fromEntries(await Promise.all(Object.entries(a).map(async([k,v])=>[k,await digest(v)])))
 const source=()=>{const a:Record<string,Uint8Array>={};for(const [key,b]of Object.entries({p:anchor.entry.inkLoad,c:anchor.entry.inkColor,coverage:anchor.entry.coverage,solvent:anchor.entry.solventLoad,foreign:anchor.entry.foreignSolventLoad,original:anchor.entry.original}))a[key]=b?(b as any).readPixels():new Uint8Array(size*size*4);a.paper=withPaper(()=>captureNativePaperHeight(engine.gl,ctx.paperTex(),size,[0,0],[ctx.paperWorldSize().w,ctx.paperWorldSize().h],ctx.paperScale()));return a}
 const metadata=()=>JSON.stringify(anchor.scratch.captureFinishMetadata(),(k,v)=>k==='target'?undefined:v)
 const sourceSHA=await hashes(source()),metadataBefore=metadata()
 let buffers:any,c:Uint8Array,start=0,submitted=0,ready=0
 try{withPaper(()=>{start=performance.now();buffers=controller.diagnosticRunCore();submitted=performance.now();c=buffers.c.readPixels();ready=performance.now()})}catch(error){controller.diagnosticCancelCore();throw error}
 const outputSHA=await hashes({p:buffers.p.readPixels(),c:c!,coverage:buffers.coverage.readPixels()}),sourceSHAAfter=await hashes(source())
 for(const k in sourceSHA)if(sourceSHA[k]!==sourceSHAAfter[k])throw Error('Native direct source changed '+k)
 if(metadata()!==metadataBefore)throw Error('Native direct metadata changed')
 const glError=engine.gl.getError();if(glError)throw Error('Native direct WebGL error '+glError)
 return{output:c!,outputSHA,sourceSHA,sourceSHAAfter,sourceUnchanged:true,metadataSHA:await digest(new TextEncoder().encode(metadataBefore)),sample:{coreHostMs:submitted-start,fullCReadMs:ready-submitted,totalToFullCMs:ready-start,readBytes:size*size*4,glError,scope:'Existing native GPU source → reset/step/dry + full 1024RGBA8 C CPU read; NO CPU component wrapper. P/coverage reads, SHA, source proof and presentation excluded.',qualification:'Full-output wall time on this GPU. NOT pen-up latency, pure GPU elapsed, or the component-isolated QA-wrapper boundary.'}}
}
