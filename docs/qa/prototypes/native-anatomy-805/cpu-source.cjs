'use strict';
// Optional QA-only host instrumentation. No added GPU readback or gl.finish.
const KEY='__qaNativeCpuTimeline805';
const helpers=`
function qaCpuEmit805(event:unknown){(globalThis as unknown as {${KEY}?:(event:unknown)=>void}).${KEY}?.(event)}
function qaCpuSpan805<T>(id:string,lane:'cpu'|'transfer',work:()=>T):T{qaCpuEmit805({type:'begin',id,lane});try{return work()}finally{qaCpuEmit805({type:'end',id})}}
async function qaCpuAsyncSpan805<T>(id:string,lane:'cpu'|'transfer',work:()=>Promise<T>):Promise<T>{qaCpuEmit805({type:'begin',id,lane});try{return await work()}finally{qaCpuEmit805({type:'end',id})}}
function qaCpuAnatomy805(event:{stage:string}){(globalThis as unknown as {__qaNativeAnatomy805?:(event:unknown)=>void}).__qaNativeAnatomy805?.(event);qaCpuEmit805({type:'stage',stage:event.stage})}
`;
function one(source,anchor,replacement){if(source.split(anchor).length!==2)throw Error('CPU timeline source drift: '+anchor.slice(0,100));return source.replace(anchor,replacement)}
function transformNativeCpuTimeline805(file,source){
 const name=file.replaceAll('\\','/').split('/').pop(),engine=['ContrastPhase.ts','PuddleTarget.ts','BackgroundMix.ts','WatercolorSettlePlan.ts','WatercolorFrontPaths.ts'].includes(name);
 if(!engine&&!['native-direct-timed.ts','gpu-group-goal.ts'].includes(name))return source;
 if(source.includes('QA_NATIVE_CPU_TIMELINE_805'))throw Error('CPU timeline transform already applied');let s=source;
 if(engine){
  const anchor='(globalThis as unknown as {__qaNativeAnatomy805?: (event:unknown)=>void}).__qaNativeAnatomy805?.(';
  if(!s.includes(anchor))throw Error('CPU timeline requires preceding anatomy transform: '+name);
  s=s.split(anchor).join('qaCpuAnatomy805(');
  if(name==='ContrastPhase.ts'){
   s=one(s,'const bytes=selection.readPixels()',"const bytes=qaCpuSpan805('selection.readback','transfer',()=>selection.readPixels())");
   s=one(s,'const keep=retainedComponents(bytes,nx,ny,minCells)',"const keep=qaCpuSpan805('selection.filter','cpu',()=>retainedComponents(bytes,nx,ny,minCells))");
   s=one(s,'regionKeep.writePixels(keep);',"qaCpuSpan805('selection.upload','transfer',()=>regionKeep.writePixels(keep));");
  }
 }else if(name==='native-direct-timed.ts'){
  s=one(s,'const hashes=async(a:Record<string,Uint8Array>)=>Object.fromEntries(await Promise.all(Object.entries(a).map(async([k,v])=>[k,await digest(v)])))',"const hashes=async(a:Record<string,Uint8Array>)=>qaCpuAsyncSpan805('sha.maps','cpu',async()=>Object.fromEntries(await Promise.all(Object.entries(a).map(async([k,v])=>[k,await digest(v)]))))");
  s=one(s,'const source=()=>{',"const source=()=>qaCpuSpan805('source.capture-seven','cpu',()=>{");
  s=one(s,'a[key]=b?(b as any).readPixels():new Uint8Array(size*size*4)',"a[key]=qaCpuSpan805('source.capture-'+key,b?'transfer':'cpu',()=>b?(b as any).readPixels():new Uint8Array(size*size*4))");
  const paper='a.paper=withPaper(()=>captureNativePaperHeight(engine.gl,ctx.paperTex(),size,[0,0],[ctx.paperWorldSize().w,ctx.paperWorldSize().h],ctx.paperScale()))';
  s=one(s,paper,"a.paper=qaCpuSpan805('source.capture-paper','transfer',()=>withPaper(()=>captureNativePaperHeight(engine.gl,ctx.paperTex(),size,[0,0],[ctx.paperWorldSize().w,ctx.paperWorldSize().h],ctx.paperScale())))");
  s=one(s,';return a}\n const metadata=', ';return a})\n const metadata=');
  s=one(s,'const sourceSHA=await hashes(source()),metadataBefore=metadata()',"const sourceSHA=await qaCpuAsyncSpan805('source.before-proof','cpu',()=>hashes(source())),metadataBefore=qaCpuSpan805('metadata.before','cpu',()=>metadata())");
  s=one(s,'buffers=controller.diagnosticRunCore()',"buffers=qaCpuSpan805('core','cpu',()=>controller.diagnosticRunCore())");
  s=one(s,'c=buffers.c.readPixels()',"c=qaCpuSpan805('output.c-read','transfer',()=>buffers.c.readPixels())");
  s=one(s,'const outputSHA=await hashes({p:buffers.p.readPixels(),c:c!,coverage:buffers.coverage.readPixels()}),sourceSHAAfter=await hashes(source())',"const outputSHA=await qaCpuAsyncSpan805('output.proof','cpu',()=>hashes({p:qaCpuSpan805('output.p-read','transfer',()=>buffers.p.readPixels()),c:c!,coverage:qaCpuSpan805('output.coverage-read','transfer',()=>buffers.coverage.readPixels())})),sourceSHAAfter=await qaCpuAsyncSpan805('source.after-proof','cpu',()=>hashes(source()))");
  s=one(s,'if(metadata()!==metadataBefore)',"if(qaCpuSpan805('metadata.after','cpu',()=>metadata())!==metadataBefore)");
  s=one(s,'const glError=engine.gl.getError()',"const glError=qaCpuSpan805('gl.validation','cpu',()=>engine.gl.getError())");
  s=one(s,'metadataSHA:await digest(new TextEncoder().encode(metadataBefore))',"metadataSHA:await qaCpuAsyncSpan805('metadata.hash','cpu',()=>digest(new TextEncoder().encode(metadataBefore)))");
 }else{
  s=one(s,'const pollStart=now()',"const pollStart=now();qaCpuEmit805({type:'begin',id:'query.poll',lane:'cpu'})");
  s=one(s,'const intervals=queries.map',"qaCpuEmit805({type:'end',id:'query.poll'});const intervals=queries.map");
 }
 return '// QA_NATIVE_CPU_TIMELINE_805\n'+helpers+s;
}
module.exports={KEY,transformNativeCpuTimeline805};
