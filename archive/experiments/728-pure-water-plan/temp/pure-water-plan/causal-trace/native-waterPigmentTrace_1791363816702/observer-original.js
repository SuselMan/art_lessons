(function installPureTailObserver(E, options={}) {
  if(!E?._settleQueue||!E?._settlePlan||!E?._watercolorPasses)throw Error('Actual engine owners required');
  const q=E._settleQueue,p=E._settlePlan,passes=E._watercolorPasses;
  const limit=options.limit??20000,records=[],undo=[],ids=new WeakMap(),jobs=new WeakMap();let nextID=0,nextJob=0,scope=null,overflow=false;
  const id=x=>{if(!x||typeof x!=='object'&&typeof x!=='function')return null;if(!ids.has(x))ids.set(x,++nextID);return ids.get(x)};
  const stamp=()=>performance.now();
  const add=r=>{if(records.length<limit)records.push(r);else overflow=true};
  function jobInfo(job){if(!job)return null;if(!jobs.has(job))jobs.set(job,++nextJob);return jobs.get(job)}
  function context(){const s=scope;if(!s)return {job:null,op:null,index:null,phase:'outsideQueue'};const index=s.mode==='advance'?((q.current??q._settle)?s.index:s.job.ops.length):s.mode==='start'?0:s.job.next;return{job:jobInfo(s.job),op:id(s.job.ops[index]),index,phase:index>=s.job.ops.length?'finish/land/source-rebase':s.mode};}
  function patch(object,name,invoke){const original=object?.[name];if(typeof original!=='function')throw Error('Missing actual method '+name);function observed(...args){return invoke.call(this,original,args)}object[name]=observed;undo.push(()=>{if(object[name]===observed)object[name]=original})}
  function span(name,invoke){const c=context(),at=stamp(),mark=`wc-tail:${name}:j${c.job}:op${c.op}:i${c.index}:${records.length}`;performance.mark(mark+':begin');try{return invoke()}finally{const end=stamp();performance.mark(mark+':end');performance.measure(mark,mark+':begin',mark+':end');add({name,...c,at,end,submitMs:end-at})}}
  patch(q,'start',function(original,args){const old=scope;const fake={ops:args[1],next:0,scratch:args[0]};scope={mode:'start',job:fake};add({name:'job.start',job:jobInfo(fake),scratch:id(args[0]),ops:args[1].map(id),at:stamp()});try{return span('queue.start',()=>original.apply(this,args))}finally{const actual=this.current??this._settle;if(actual)jobs.set(actual,jobInfo(fake));scope=old}});
  patch(q,'advance',function(original,args){const old=scope,job=this.current??this._settle;if(job)scope={mode:'advance',job,index:job.next};try{return span('queue.advance',()=>original.apply(this,args))}finally{scope=old}});
  patch(q,'complete',function(original,args){const old=scope,job=this.current??this._settle;if(job)scope={mode:'complete',job};try{return span('queue.complete',()=>original.apply(this,args))}finally{scope=old}});
  patch(p,'prepare',function(original,args){const result=original.apply(this,args);add({name:'plan.prepare',at:stamp(),scratch:id(args[0]),skipZero:args[11]===true,knownZero:args[0]?.pigmentInputsKnownZero===true,purePlan:this.diagnosticPureWaterPlan===true,owner:args[13]===true,ops:result?.ops.map(id)??[],finish:id(result?.finish)});return result});
  for(const name of ['fieldOp','waterFrontStep','wcResample','diffuseStep','brushPass','pigmentColor','costDomainStep'])patch(passes,name,function(original,args){const label=name==='fieldOp'?name+'.mode'+args[3]:name;return span(label,()=>original.apply(this,args))});
  for(const name of ['drawArrays','drawElements'])if(typeof E.gl?.[name]==='function')patch(E.gl,name,function(original,args){add({name:'gl.'+name,...context(),at:stamp(),mode:args[0],count:args[name==='drawArrays'?2:1]});return original.apply(this,args)});
  const bufferPrototypes=new WeakSet();
  function observeBuffer(buffer){const proto=buffer&&Object.getPrototypeOf(buffer);if(!proto||bufferPrototypes.has(proto))return;bufferPrototypes.add(proto);for(const name of ['clear','copyTo','copyRegionInto'])if(typeof proto[name]==='function')patch(proto,name,function(original,args){add({name:'buffer.'+name,...context(),at:stamp(),source:id(this),destination:id(args[0])});return span('buffer.'+name,()=>original.apply(this,args))});}
  if(E._ribbonScratchPool?.acquire)patch(E._ribbonScratchPool,'acquire',function(original,args){const buffer=original.apply(this,args);observeBuffer(buffer);return buffer});
  const painter=E._ribbonPainter;
  if(painter?.ctx?.drawRibbonBands)patch(painter.ctx,'drawRibbonBands',function(original,args){return span(scope?'source-command.drawRibbonBands':'native.drawRibbonBands',()=>original.apply(this,args))});
  // Return exactly the same generator. No next(), return(), shader write,
  // readback, finish wrapping, job.ops replacement or scheduling-tag mutation.
  if(painter?.paint)patch(painter,'paint',function(original,args){const generator=original.apply(this,args);add({name:'native.paint.generator-created',at:stamp(),generator:id(generator),scratch:id(args[6])});return generator});
  return {records,get overflow(){return overflow},stop(){for(const restore of undo.reverse())restore();return{records,overflow,scope:'CPU command submission labels only; GPU wall requires external trace correlation',noReadback:true}}};
})
