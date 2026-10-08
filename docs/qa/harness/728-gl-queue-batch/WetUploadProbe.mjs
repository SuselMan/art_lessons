/** OFF QA instrumentation: CPU call wall and optional nonnested WebGL1 GPU query. */
export function installWetUploadProbe(engine,{gpuTiming=false,maxRecords=8,clock=performance}={}){
 if(maxRecords!==8)throw Error('Explicit eight-upload bound required');
 const gl=engine.gl,ext=gpuTiming?gl.getExtension('EXT_disjoint_timer_query'):null,records=[],queries=ext?Array.from({length:maxRecords},()=>ext.createQueryEXT()):[];
 const original={activeTexture:gl.activeTexture,bindTexture:gl.bindTexture,texImage2D:gl.texImage2D,texSubImage2D:gl.texSubImage2D};let unit=null,restored=false,queriesDisposed=false;const disposeQueries=()=>{if(queriesDisposed)return;queriesDisposed=true;for(const query of queries)if(query)ext.deleteQueryEXT(query)};const bound=new Map();
 gl.activeTexture=function(value){unit=value;return original.activeTexture.call(this,value)};
 gl.bindTexture=function(target,texture){if(target===gl.TEXTURE_2D&&unit!==null)bound.set(unit,texture);return original.bindTexture.call(this,target,texture)};
 for(const method of ['texImage2D','texSubImage2D'])gl[method]=function(...args){
  if(args[0]!==gl.TEXTURE_2D||!engine._wetTex||bound.get(unit)!==engine._wetTex||records.length>=maxRecords)return original[method].apply(this,args);
  const record={method,width:args[method==='texImage2D'?3:4],height:args[method==='texImage2D'?4:5],bytes:args[8]?.byteLength??0,gesture:engine._strokeId??null,cpuMs:null,gpuMs:null,gpuStatus:ext?'pending':'unsupported'};const query=queries[records.length];records.push(record);
  const active=ext&&ext.getQueryEXT(ext.TIME_ELAPSED_EXT,ext.CURRENT_QUERY_EXT);if(active)record.gpuStatus='skipped-nested';const usable=ext&&query&&!active;if(ext&&!query)record.gpuStatus='query-allocation-failed';
  if(usable)ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);const start=clock.now();try{return original[method].apply(this,args)}finally{record.cpuMs=clock.now()-start;if(usable)ext.endQueryEXT(ext.TIME_ELAPSED_EXT)};
 };
 const restore=()=>{if(restored)return;restored=true;for(const[k,v]of Object.entries(original))gl[k]=v;};
 return{async finish(){restore();const deadline=clock.now()+3000;try{for(let i=0;i<records.length;i++){const record=records[i];if(record.gpuStatus!=='pending')continue;const query=queries[i];while(!ext.getQueryObjectEXT(query,ext.QUERY_RESULT_AVAILABLE_EXT)&&clock.now()<deadline)await new Promise(requestAnimationFrame);if(gl.getParameter(ext.GPU_DISJOINT_EXT))record.gpuStatus='disjoint';else if(!ext.getQueryObjectEXT(query,ext.QUERY_RESULT_AVAILABLE_EXT))record.gpuStatus='timeout';else{record.gpuMs=ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6;record.gpuStatus='valid';}}return{records,gpuSupported:!!ext,limitations:'Diagnostic wrappers/query markers perturb scheduling. CPU call return and GPU elapsed are distinct; not physical onset or complete upload/driver cost.'};}finally{disposeQueries()}},cancel(){restore();disposeQueries()}};
}
