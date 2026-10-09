/** Model clocks only in synchronous pointer calls. Queue drains/slices retain real clock. */
export function withControlledInputClock(e,run){
 const realNow=performance.now.bind(performance),descriptor=Object.getOwnPropertyDescriptor(performance,'now'),realDate=Date.now;
 const keys=['_onStart','_onMove','_onEnd','_completeSettle','_runSlice'],original=Object.fromEntries(keys.map(k=>[k,e[k]]));const timeOrigin=realNow();let logical=timeOrigin,depth=0,realDepth=0,realBudgetCalls=0;
 const restoreNow=()=>{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now};
 const setModel=()=>Object.defineProperty(performance,'now',{configurable:true,value:()=>logical});
 const realScope=fn=>{realDepth++;restoreNow();Date.now=realDate;try{return fn()}finally{realDepth--;if(depth&&!realDepth){setModel();Date.now=()=>1791490000000}}};
 for(const key of ['_onStart','_onMove','_onEnd'])e[key]=function(...args){depth++;if(!realDepth){setModel();Date.now=()=>1791490000000}try{return original[key].apply(this,args)}finally{depth--;if(depth&&!realDepth)setModel();else{restoreNow();Date.now=realDate}}};
 for(const key of ['_completeSettle','_runSlice'])e[key]=function(...args){realBudgetCalls++;return realScope(()=>original[key].apply(this,args))};
 try{const result=run({timeOrigin,clock:at=>{logical=timeOrigin+at}});if(result?.then)throw Error('Controlled input scope must be synchronous');return{result,realBudgetCalls,realNowSample:realNow()}}finally{for(const key of keys)e[key]=original[key];restoreNow();Date.now=realDate}
}
