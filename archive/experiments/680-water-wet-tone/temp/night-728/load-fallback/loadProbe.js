(() => {
 const trace=window.__loadTrace={start:performance.now(),calls:[],engineSet:null}
 const wrapped=new WeakSet();let current
 Object.defineProperty(window,'__engine',{configurable:true,get:()=>current,set(e){
  current=e;if(!e)return;e.bakeNetworkSnapshot=()=>null;trace.engineSet=performance.now();if(wrapped.has(e))return;wrapped.add(e)
  for(const name of ['restoreLayerFromSnapshot','restoreHistoricalOperations','absorbHistoricalOperations','appendOperation']){
   const original=e[name];if(typeof original!=='function')continue
   e[name]=function(...args){const row={name,start:performance.now(),count:Array.isArray(args[0])?args[0].length:undefined,type:args[0]?.type,id:args[0]?.id};trace.calls.push(row)
    try{const result=original.apply(this,args);if(result?.then)return result.then(v=>{row.end=performance.now();return v},err=>{row.error=String(err);row.end=performance.now();throw err});row.end=performance.now();return result}
    catch(err){row.error=String(err);row.end=performance.now();throw err}
   }
  }
 }})
})()
