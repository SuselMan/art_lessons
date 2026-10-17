// Optional diagnostic only. Inject in a physical-GPU page before a bounded Undo.
// No pixels, gl.finish, readPixels or per-draw timer queries. Consecutive draws
// using one program share a query until useProgram changes. Poll only AFTER Undo.
module.exports.installGpuProgramTimer=function installGpuProgramTimer(gl,{maxBatches=1024}={}){
 const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 if(!ext||typeof gl.createQuery!=='function')return{supported:false,stop:async()=>({supported:false,reason:'EXT_disjoint_timer_query_webgl2 unavailable'})};
 const original={useProgram:gl.useProgram,drawArrays:gl.drawArrays,drawElements:gl.drawElements},records=new Map(),queries=[];
 let flushQueued=false;
 let program=gl.getParameter(gl.CURRENT_PROGRAM),active=null,stopped=false,disjoint=!!gl.getParameter(ext.GPU_DISJOINT_EXT),skipped=0,totalDraws=0;
 const cpuStart=performance.now(),info=p=>{let r=records.get(p);if(!r){const shaders=p?gl.getAttachedShaders(p).map(s=>gl.getShaderSource(s)||''):[];r={shaders,draws:0,batches:0,gpuNs:0,completed:0};records.set(p,r)}return r};
 function close(){if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(active);active=null}}
 function draw(){const r=info(program);r.draws++;totalDraws++;if(active)return;if(queries.length>=maxBatches){skipped++;return}if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){skipped++;return}const query=gl.createQuery();if(!query){skipped++;return}gl.beginQuery(ext.TIME_ELAPSED_EXT,query);active={query,record:r};r.batches++;if(!flushQueued){flushQueued=true;queueMicrotask(()=>{flushQueued=false;close()})}}
 gl.useProgram=function(p){if(p!==program)close();const value=original.useProgram.call(this,p);program=p;return value};
 gl.drawArrays=function(...a){draw();return original.drawArrays.apply(this,a)};
 gl.drawElements=function(...a){draw();return original.drawElements.apply(this,a)};
 return{supported:true,async stop({timeoutMs=15000}={}){
  if(stopped)throw Error('GPU timer already stopped');stopped=true;close();
  gl.useProgram=original.useProgram;gl.drawArrays=original.drawArrays;gl.drawElements=original.drawElements;
  const cpuStop=performance.now(),deadline=cpuStop+timeoutMs;let pending=queries.slice();
  try{while(pending.length&&performance.now()<deadline){disjoint ||= !!gl.getParameter(ext.GPU_DISJOINT_EXT);pending=pending.filter(item=>{if(!gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE))return true;item.record.gpuNs+=gl.getQueryParameter(item.query,gl.QUERY_RESULT);item.record.completed++;return false});if(pending.length)await new Promise(r=>setTimeout(r,50))}disjoint ||= !!gl.getParameter(ext.GPU_DISJOINT_EXT);
   const hash=async source=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('');
   const programs=[];for(const r of records.values())programs.push({shaderSHA:await Promise.all(r.shaders.map(hash)),draws:r.draws,batches:r.batches,completedBatches:r.completed,gpuMs:disjoint?null:r.gpuNs/1e6});
   return{supported:true,disjoint,totalDraws,queries:queries.length,unmeasuredDraws:skipped,incompleteQueries:pending.length,complete:!disjoint&&!pending.length&&!skipped,measuredWindowWallMs:cpuStop-cpuStart,queryPollWallMs:performance.now()-cpuStop,sumMeasuredGpuMs:disjoint?null:programs.reduce((n,r)=>n+r.gpuMs,0),programs,limitations:['Diagnostic marker overhead is included; compare separately against uninstrumented Undo.','GPU query sum measures queued draw batches, not UI display latency or network ACK. Task-end closes prevent measuring inter-frame idle waits; command-submission bubbles within one task can still be included.','No shader/pixel change; no gl.finish/readPixels; current program batches may include non-draw GPU commands.','No canonical cross-device determinism claim. Max-batch truncation, disjoint or timeout makes coverage incomplete.']};
  }finally{for(const{query}of queries)gl.deleteQuery(query)}
 }};
};
