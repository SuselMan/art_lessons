(() => {
 const trace=window.__loadTrace={start:performance.now(),calls:[],engineSet:null}
 const wrapped=new WeakSet();let current
 Object.defineProperty(window,'__engine',{configurable:true,get:()=>current,set(e){
  current=e;if(!e)return;trace.engineSet=performance.now();if(wrapped.has(e))return;wrapped.add(e)
  const bake=e.bakeNetworkSnapshot
  trace.bakes=[];trace.uploads=[];trace.bakingEnabled=false
  e.bakeNetworkSnapshot=()=>null
  window.__enableRealSnapshotBake=()=>{e.bakeNetworkSnapshot=function(...args){const at=performance.now(),result=bake.apply(this,args);if(trace.bakes.length<128)trace.bakes.push({at,layer:args[0],bytes:result?.length??0});return result};trace.bakingEnabled=true;return true}
  const oldFetch=window.fetch;window.fetch=async function(...args){const r=await oldFetch.apply(this,args);if(String(args[0]).includes('/snapshots')&&args[1]?.method==='POST'){const body=JSON.parse(args[1].body);trace.uploads.push({at:performance.now(),status:r.status,seq:body.seq,layers:Object.keys(body.layers)})}return r}
  for(const name of ['restoreLayerFromSnapshot','restoreHistoricalOperations','absorbHistoricalOperations','appendOperation','setUnpaintedInBatch','_paintDabs']){
   const original=e[name];if(typeof original!=='function')continue
   e[name]=function(...args){const row={name,start:performance.now(),count:Array.isArray(args[0])?args[0].length:undefined,type:args[0]?.type,id:args[0]?.id,unpaintedIds:args[0] instanceof Set?[...args[0]]:undefined};if(trace.calls.length>=512){trace.dropped=(trace.dropped??0)+1;return original.apply(this,args)}trace.calls.push(row)
    try{const result=original.apply(this,args);if(result?.then)return result.then(v=>{row.end=performance.now();return v},err=>{row.error=String(err);row.end=performance.now();throw err});row.end=performance.now();return result}
    catch(err){row.error=String(err);row.end=performance.now();throw err}
   }
  }
 }})
})()
