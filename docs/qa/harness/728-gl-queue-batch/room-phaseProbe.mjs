/** CPU-only own-instance diagnostic; no readback/query/extra fence.
 * Raw GL1 only; never patch adapted GL2 after bound-method caching. */
export function installRoomPhaseProbe(E,{maxRows=1024}={}){
 const rows=[],restores=[],stack=[];let dropped=0,phase='idle'
 const state=()=>({settle:!!E._settle,next:E._settle?.next??null,total:E._settle?.ops.length??null,lease:E._wcJoinedTouchLease===E._settle&&!!E._settle,gesture:E._strokeId??null,tool:E._opts?.tool??null,preset:E._opts?.pencilType??null})
 const put=row=>{if(rows.length<maxRows)rows.push(row);else dropped++}
 const wrap=(object,name)=>{const original=object?.[name];if(typeof original!=='function')return false
  const wrapped=function(...args){const at=performance.now(),before=state(),parent=stack.at(-1)??null;stack.push(name);let error
   try{return original.apply(this,args)}catch(e){error=String(e);throw e}finally{stack.pop();put({name,parent,phase,at,cpuMs:performance.now()-at,before,after:state(),error})}}
  object[name]=wrapped;restores.push(()=>{if(object[name]===wrapped)object[name]=original});return true}
 const methods=['_onStart','_onMove','_onEnd','_completeSettle','_paintStrokeDabs','_paintDabs','_runSlice','_syncBuffersToLog','_makeLayerBuffer','_createBuffer','_destroyBuffer']
 const coverage=methods.map(name=>({name,installed:wrap(E,name)}))
 // These calls are CPU/API intervals only. Existing finish semantics unchanged.
 const rawGl1=typeof WebGLRenderingContext!=='undefined'&&E.gl instanceof WebGLRenderingContext&&!(typeof WebGL2RenderingContext!=='undefined'&&E.gl instanceof WebGL2RenderingContext)
 if(rawGl1)for(const name of ['finish','flush','texImage2D','texSubImage2D'])coverage.push({name,installed:wrap(E.gl,name)})
 else coverage.push({name:'rawGL API',installed:false,reason:'GL2 adapter binding/override hazards; not wrapped'})
 return{setPhase(value){phase=value},snapshot(){return{rows:rows.map(r=>({...r})),dropped,coverage,limitations:['CPU execution/API time, never physical screen latency or GPU time','Stack brackets queue drain versus new source; no synchronization added','Instrumented run changes CPU timing; separate uninstrumented scene required']}},detach(){for(const restore of restores.splice(0))restore()}}
}
