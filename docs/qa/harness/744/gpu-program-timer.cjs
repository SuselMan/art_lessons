// Optional diagnostic only. Inject in a physical-GPU page before a bounded Undo.
// No pixels, gl.finish, readPixels or per-draw timer queries. Consecutive draws
// using one program share a query until useProgram changes. Poll only AFTER Undo.
module.exports.installGpuProgramTimer=function installGpuProgramTimer(gl,{maxBatches=1024}={}){
 const modern=gl.getExtension('EXT_disjoint_timer_query_webgl2'),legacy=modern?null:gl.getExtension('EXT_disjoint_timer_query'),ext=modern??legacy;
 const supported=!!ext,api=modern?{create:()=>gl.createQuery(),begin:q=>gl.beginQuery(ext.TIME_ELAPSED_EXT,q),end:()=>gl.endQuery(ext.TIME_ELAPSED_EXT),current:()=>gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY),available:q=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE),result:q=>gl.getQueryParameter(q,gl.QUERY_RESULT),remove:q=>gl.deleteQuery(q)}:legacy?{create:()=>ext.createQueryEXT(),begin:q=>ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q),end:()=>ext.endQueryEXT(ext.TIME_ELAPSED_EXT),current:()=>ext.getQueryEXT(ext.TIME_ELAPSED_EXT,ext.CURRENT_QUERY_EXT),available:q=>ext.getQueryObjectEXT(q,ext.QUERY_RESULT_AVAILABLE_EXT),result:q=>ext.getQueryObjectEXT(q,ext.QUERY_RESULT_EXT),remove:q=>ext.deleteQueryEXT(q)}:null;
 const original={useProgram:gl.useProgram,drawArrays:gl.drawArrays,drawElements:gl.drawElements},records=new Map(),queries=[];
 let flushQueued=false;
 let program=gl.getParameter(gl.CURRENT_PROGRAM),active=null,stopped=false,disjoint=!!ext&&(!!ext&&!!gl.getParameter(ext.GPU_DISJOINT_EXT)),skipped=0,totalDraws=0;
 const cpuStart=performance.now(),info=p=>{let r=records.get(p);if(!r){const shaders=p?gl.getAttachedShaders(p).map(s=>gl.getShaderSource(s)||''):[];r={shaders,draws:0,batches:0,gpuNs:0,completed:0};records.set(p,r)}return r};
 function close(){if(active){api.end();queries.push(active);active=null}}
 function draw(){const r=info(program);r.draws++;totalDraws++;if(!supported){skipped++;return}if(active)return;if(queries.length>=maxBatches){skipped++;return}if(api.current()){skipped++;return}const query=api.create();if(!query){skipped++;return}api.begin(query);active={query,record:r};r.batches++;if(!flushQueued){flushQueued=true;queueMicrotask(()=>{flushQueued=false;close()})}}
 gl.useProgram=function(p){if(p!==program)close();const value=original.useProgram.call(this,p);program=p;return value};
 gl.drawArrays=function(...a){draw();return original.drawArrays.apply(this,a)};
 gl.drawElements=function(...a){draw();return original.drawElements.apply(this,a)};
 return{supported,async stop({timeoutMs=15000}={}){
  if(stopped)throw Error('GPU timer already stopped');stopped=true;close();
  gl.useProgram=original.useProgram;gl.drawArrays=original.drawArrays;gl.drawElements=original.drawElements;
  const cpuStop=performance.now(),deadline=cpuStop+timeoutMs;let pending=queries.slice();
  try{while(pending.length&&performance.now()<deadline){disjoint ||= (!!ext&&!!gl.getParameter(ext.GPU_DISJOINT_EXT));pending=pending.filter(item=>{if(!api.available(item.query))return true;item.record.gpuNs+=api.result(item.query);item.record.completed++;return false});if(pending.length)await new Promise(r=>setTimeout(r,50))}disjoint ||= (!!ext&&!!gl.getParameter(ext.GPU_DISJOINT_EXT));
   const hash=async source=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('');
   const programs=[];for(const r of records.values())programs.push({shaderSHA:await Promise.all(r.shaders.map(hash)),draws:r.draws,batches:r.batches,completedBatches:r.completed,gpuMs:!supported||disjoint?null:r.gpuNs/1e6});
   return{supported,api:modern?'WebGL2 EXT_disjoint_timer_query_webgl2':legacy?'WebGL1 EXT_disjoint_timer_query':'unavailable (draw counts only)',glVersion:gl.getParameter(gl.VERSION),disjoint,totalDraws,queries:queries.length,unmeasuredDraws:skipped,incompleteQueries:pending.length,complete:supported&&!disjoint&&!pending.length&&!skipped,measuredWindowWallMs:cpuStop-cpuStart,queryPollWallMs:performance.now()-cpuStop,sumMeasuredGpuMs:!supported||disjoint?null:programs.reduce((n,r)=>n+r.gpuMs,0),programs,limitations:['Diagnostic marker overhead is included; compare separately against uninstrumented Undo.','GPU query sum measures queued draw batches, not UI display latency or network ACK. Task-end closes prevent measuring inter-frame idle waits; command-submission bubbles within one task can still be included.','No shader/pixel change; no gl.finish/readPixels; current program batches may include non-draw GPU commands.','No canonical cross-device determinism claim. Max-batch truncation, disjoint or timeout makes coverage incomplete.']};
  }finally{for(const{query}of queries)api.remove(query)}
 }};
};
