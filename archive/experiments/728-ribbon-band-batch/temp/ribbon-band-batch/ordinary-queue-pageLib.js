(()=>{
 const e=window.__engine;if(!e)throw Error('Room engine absent');const data={created:performance.now(),requests:[],jobs:[],finishes:[],overflow:false};window.__queue728=data;let id=0;
 const q=e._wcCanonical,enqueue=q.enqueue;
 q.enqueue=function(request){
  const stack=new Error('enqueue classification').stack||'',kind=stack.includes('_finishRibbonStroke')?'finish':stack.includes('_ribbonStrokeWork')?'material':'other';
  const row={id:++id,kind,enqueued:performance.now(),pendingAtEnqueue:this.requests.length,steps:0,stepCpuMs:0,maxStepCpuMs:0};if(data.requests.length<2048){data.requests.push(row);if(data.requests.filter(x=>x.kind===kind).length<=2)row.stack=stack;}else data.overflow=true;
  const execute=request.execute,cancel=request.cancel;
  const wrapped={...request,execute:function(...args){row.start=performance.now();const iterator=execute.apply(request,args),next=iterator.next;iterator.next=function(...args){const t=performance.now();try{const r=next.apply(this,args);row.steps++;if(r.done)row.end=performance.now();return r;}finally{const d=performance.now()-t;row.stepCpuMs+=d;row.maxStepCpuMs=Math.max(row.maxStepCpuMs,d)}};return iterator;},cancel:function(...args){row.cancel=performance.now();return cancel?.apply(request,args)}};
  return enqueue.call(this,wrapped);
 };
 const finish=e._finishRibbonStroke;e._finishRibbonStroke=function(...args){const t=performance.now(),s=args[0],owned=args[4];const row={t,owned:!!owned,reveal:args[1],fade:args[2],spread:args[3],gesture:owned?.gesture??s?.gesture,bounds:structuredClone((owned?.finish??s?.finishContext)?.bounds??null)};if(data.finishes.length<256)data.finishes.push(row);try{return finish.apply(this,args)}finally{row.cpuMs=performance.now()-t}};
 const p=e._settlePlan,prepare=p.prepare;p.prepare=function(...args){const t=performance.now(),job=prepare.apply(this,args);if(job){const row={t,prepareCpuMs:performance.now()-t,initial:job.ops.length,ownerLocked:args[13],bounds:structuredClone(args[0]?.finishContext?.bounds??null)};data.jobs.push(row);const f=job.finish;job.finish=function(...a){row.finished=performance.now();row.final=job.ops.length;return f.apply(this,a)}}return job};
 return true;
})()
