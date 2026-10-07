(async()=>{
 const e=window.__engine,rows=new Map(),edges=new Map(),stack=[],restore=[],events=[],frames=[],longTasks=[];
 const at=performance.now();let recording=true,frameHandle;
 const mark=name=>events.push({name,t:performance.now()-at});
 const wrap=(obj,name,label)=>{const fn=obj?.[name];if(typeof fn!=='function'||/Generator/.test(fn.constructor.name))return;
 const own=Object.getOwnPropertyDescriptor(obj,name);
 const row={id:label,calls:0,totalMs:0,selfMs:0,maxMs:0,errors:0,samples:[],promises:0};rows.set(label,row);
 const wrapped=function(...args){if(!recording)return fn.apply(this,args);const parent=stack.at(-1),start=performance.now(),entry={label,child:0};if(parent){const key=parent.label+'\n'+label;edges.set(key,(edges.get(key)||0)+1)}stack.push(entry);row.calls++;let result;try{result=fn.apply(this,args);if(result&&typeof result.then==='function')row.promises++;return result}catch(err){row.errors++;throw err}finally{const elapsed=performance.now()-start;stack.pop();row.totalMs+=elapsed;row.selfMs+=Math.max(0,elapsed-entry.child);row.maxMs=Math.max(row.maxMs,elapsed);if(row.samples.length<4096)row.samples.push(elapsed);if(parent)parent.child+=elapsed}};
 Object.defineProperty(obj,name,{value:wrapped,configurable:true,writable:true});restore.push(()=>{if(obj[name]!==wrapped)throw Error('wrapper ownership '+label);if(own)Object.defineProperty(obj,name,own);else delete obj[name]});
 };
 const methods=(obj,label,names)=>{for(const n of names)wrap(obj,n,label+'.'+n)};
 methods(e,'Engine',['_onStart','_onMove','_onEnd','_paintDabs','_finishRibbonStroke','_startSettle','_completeSettle','_diffuseFieldFor','_display','_displayIfNotSuspended','_flushStrokeChunk','_dryWashScratch','_resolveWithinSheet','_ensureStrokeRestored','_flushOpQueue','_paintWatercolorPresentation','_enforceGpuBudget']);
 methods(e._pointer,'PointerInput',['_handleDown','_handleMove','_handleUp']);
 methods(e._settleQueue,'Queue',['start','tick','advance','complete','cancel','scheduleTick']);
 methods(e._settlePlan,'Plan',['prepare']);
 const passes=e._settlePlan?.ctx?.passes?.();if(passes){for(const n of Object.getOwnPropertyNames(Object.getPrototypeOf(passes)))if(n!=='constructor')wrap(passes,n,'Passes.'+n)}
 const module=await import('/src/engine/src/buffers/AccumulationBuffer.ts');methods(module.AccumulationBuffer.prototype,'Buffer',['clear','copyTo','copyRegionInto','readPixels']);
 methods(e.gl,'GL',['drawArrays','drawElements','clear','readPixels','texImage2D','texSubImage2D']);
 const raf=t=>{if(!recording)return;frames.push(t-at);frameHandle=requestAnimationFrame(raf)};frameHandle=requestAnimationFrame(raf);
 let observer;try{observer=new PerformanceObserver(list=>{for(const t of list.getEntries())longTasks.push({start:t.startTime-at,duration:t.duration})});observer.observe({type:'longtask',buffered:false})}catch{}
 const heap=()=>performance.memory?.usedJSHeapSize??null;const initialHeap=heap();
 window.__callGraph={mark,stop(){recording=false;cancelAnimationFrame(frameHandle);observer?.disconnect();for(const f of restore.reverse())f();return{scope:'Instrumented synchronous method wall time incl possible GPU driver waits; not GPU execution time. Generator creation skipped; Promise completion excluded. Edges link nearest instrumented caller, intermediate methods folded.',startedAt:at,durationMs:performance.now()-at,initialHeap,finalHeap:heap(),events,frames,longTasks,nodes:[...rows.values()].filter(x=>x.calls).map(x=>{const s=x.samples.sort((a,b)=>a-b);return{...x,samples:undefined,meanMs:x.totalMs/x.calls,p95Ms:s[Math.floor((s.length-1)*.95)],p95Scope:'first <=4096 observed calls'}}),edges:[...edges].map(([key,calls])=>{const[source,target]=key.split('\n');return{source,target,calls}})}}};
 mark('counter-start');return{instrumented:rows.size};
})()
