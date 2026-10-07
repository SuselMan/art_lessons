/** Readonly scalar probe: no GPU sync/readback, performance marks or op wrapping. */
function installJoinedScheduledProbe(e) {
  const q=e._settleQueue, ids=new WeakMap(), rows=[], events=[];
  let nextId=0,closed=false;
  const id=job=>{if(!job)return null;if(!ids.has(job)){const n=++nextId;ids.set(job,n);rows.push({id:n,ops:job.ops.length,firstNext:job.next,advance:0,ticks:0,continuations:0,cpuAdvanceMs:0,cpuTickMs:0,maxTickMs:0,firstAt:performance.now(),lastAt:0,heldTicks:0,backlogAtFirst:e._opQueue.length})}return ids.get(job)};
  const row=job=>rows[id(job)-1];
  const event=(type,before,after)=>{if(events.length<24)events.push({type,at:performance.now(),before:id(before),after:id(after),held:!!e._wcJoinedDeferred,backlog:e._opQueue.length})};
  const oldTick=q.tick,oldAdvance=q.advance;
  q.tick=function(...args){const before=this.current,at=performance.now(),r=before?row(before):null;if(r){r.ticks++;r.continuations+=args[0]===true;r.heldTicks+=!!e._wcJoinedDeferred}try{return oldTick.apply(this,args)}finally{const ms=performance.now()-at;if(r){r.cpuTickMs+=ms;r.maxTickMs=Math.max(r.maxTickMs,ms);r.lastAt=performance.now();r.lastNext=before.next}if(this.current!==before)event('tick-handoff',before,this.current)}};
  q.advance=function(...args){const before=this.current,at=performance.now(),r=before?row(before):null;if(r)r.advance++;try{return oldAdvance.apply(this,args)}finally{if(r){r.cpuAdvanceMs+=performance.now()-at;r.lastAt=performance.now();r.lastNext=before.next}if(this.current!==before)event('advance-handoff',before,this.current)}};
  const wrappedTick=q.tick,wrappedAdvance=q.advance;
  return {snapshot:()=>({scope:'CPU submission/scheduled ticks only; not GPU service time',rows:rows.map(x=>({...x})),events:events.map(x=>({...x}))}),restore(){if(closed)return;closed=true;if(q.tick!==wrappedTick||q.advance!==wrappedAdvance)throw Error('Probe wrapper ownership changed');q.tick=oldTick;q.advance=oldAdvance}};
}
