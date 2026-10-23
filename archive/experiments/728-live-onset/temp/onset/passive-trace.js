(function installOnsetTrace(e, options={enabled:false}) {
 const rows=[],undo=[],ids=new WeakMap();let serial=0,jobSerial=0,currentJob=0,frontCalls=0,firstPreview=null;
 const ident=x=>x&&typeof x==='object'?(ids.has(x)?ids.get(x):(ids.set(x,++serial),serial)):null;
 const emit=(kind,data={})=>{if(rows.length<768)rows.push({kind,at:performance.now(),job:currentJob,next:e._settle?.next??null,total:e._settle?.ops?.length??null,...data})};
 const wrap=(obj,key,make)=>{const original=obj[key];if(typeof original!=='function')throw Error('Missing seam '+key);obj[key]=make(original);undo.push(()=>obj[key]=original)};
 if(options.enabled){
  const q=e._settleQueue,p=e._watercolorPasses,plan=e._settlePlan;
  emit('passport',{frontBatch:q.frontBatchEnabled,contactBatch:q.contactBatchEnabled,cap:q.contactBatchMax,phase:plan.diagnosticPlateauPhase,baked:e._wcGradientFibres,rebase:e._wcSourceFilmRebase});
  wrap(plan,'prepare',original=>function(...args){
   currentJob=++jobSerial;frontCalls=0;emit('prepare',{radius:args[4],water:args[5],landed:args[6],standing:args[7],wetPeak:args[8],strokeId:e._strokeId,preview:typeof args[10]==='function'});
   const callback=args[10];if(typeof callback==='function')args[10]=function(...payload){if(firstPreview===null)firstPreview=performance.now();emit('actual-preview-callback',{target:ident(payload[0]?.buffer),pigment:ident(payload[1]),color:ident(payload[2]),coverage:ident(payload[3]),frontCalls});return callback.apply(this,payload)};
   const job=original.apply(this,args);emit('prepared',{ops:job?.ops.length??0});return job;
  });
  wrap(q,'start',original=>function(...args){emit('queue-start');const v=original.apply(this,args);emit('first-input-captured');return v});
  wrap(p,'waterFrontStep',original=>function(...args){emit('front',{call:++frontCalls,stride:args[9],src:ident(args[4]),dst:ident(args[5])});return original.apply(this,args)});
  wrap(p,'fieldOp',original=>function(...args){const mode=args[3];if([10,12,11,6,15,16].includes(mode))emit('field',{mode,out:ident(args[0]),a:ident(args[1]),b:ident(args[2]),phase:args[5]?.tau?.[2],solvent:ident(args[5]?.e)});return original.apply(this,args)});
 }
 return {rows,get firstPreview(){return firstPreview},stop(){for(const restore of undo.reverse())restore();return rows}};
})
