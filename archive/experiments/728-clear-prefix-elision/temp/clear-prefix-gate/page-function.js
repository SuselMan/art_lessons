async function retained47ClearGate(input) {
 // CAPTURE_ONCE_BEGIN
 function originalTargetCaptureOnce(target) {
  let claimed=false;
  return (sequence, job, capture) => {
   if (!job || sequence !== target || claimed) return false;
   claimed=true;
   const finish=job.finish;
   job.finish=function(...args){try{capture()}finally{finish.apply(this,args)}};
   return true;
  };
 }
 // CAPTURE_ONCE_END
 const { PencilEngine } = await import('/src/engine/index.ts');
 const { clearedInBatch } = await import('/src/pages/Room/clearedInBatch.ts');
 const { undoneInBatch } = await import('/src/pages/Room/undoneInBatch.ts');
 window.__clearPartial={stage:'entered',sequence:0};
 const fields = new Map(), endpoint = new Map(), results = [];
 let retainedBytes = 0;
 const maxBytes = 128 * 1024 * 1024;
 const clear = input.ops.find(o => o.type === 'layer_clear');
 if (!clear || input.ops.length !== 47 || input.ops.some((o,i)=>o.seq!==i+1)) throw Error('exact full47 required');
 for (const wave of ['correctness','timing']) for (const elide of [false,true]) {
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;document.body.append(canvas);
  const e=new PencilEngine(canvas,{pageWidth:input.page[0],pageHeight:input.page[1],paper:'fine'});
  const row={wave,elide,comparisons:[],fieldStats:[],counts:{prepare:0,targetFinish:0,carryP:0,carryC:0,front:0,targetCarryP:0,targetCarryC:0,targetFront:0,paint:0,skipped:0},durations:{},states:[]};
  const claimOriginalTarget=originalTargetCaptureOnce(47);
  const clock=Date.now;let sequence=0,lastField=null,readbackMs=0,executingSequence=0;
  function partial(stage){window.__clearPartial={stage,sequence,...row,retainedBytes,lost:e.gl.isContextLost(),log:e._log.entries.map(q=>({id:q.op.id,seq:q.serverSeq,state:q.state,pending:q.pending})),rebuild:e._rebuildJobs.size,settle:!!e._settle};}
  async function idle(limit=120000){const start=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size||e._wcCanonical.pending||e._washReveals.size){if(e.gl.isContextLost()||performance.now()-start>limit){partial('idle-failed');throw Error('idle timeout/lost')}await new Promise(r=>requestAnimationFrame(r));}}
  function field(name,b){if(!b)throw Error('absent canonical '+name);const at=performance.now(),bytes=b.readPixels();readbackMs+=performance.now()-at;let nonzero=0;for(const x of bytes)nonzero+=x!==0;row.fieldStats.push({name,bytes:bytes.length,nonzero});if(!elide){if(fields.has(name))throw Error('duplicate target capture '+name);retainedBytes+=bytes.length;if(retainedBytes>maxBytes)throw Error('field retention cap128MiB');fields.set(name,bytes)}else{const old=fields.get(name);if(!old||old.length!==bytes.length)throw Error('field dimensions '+name);let changed=0,max=0;for(let i=0;i<old.length;i++){const d=Math.abs(old[i]-bytes[i]);changed+=d!==0;max=Math.max(max,d)}row.comparisons.push({name,bytes:bytes.length,changed,max});}}
  async function png(stage){const b=await e.exportPNG(true);if(!b)throw Error('missingPNG');const image=await createImageBitmap(b),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);image.close();const bytes=ctx.getImageData(0,0,c.width,c.height).data;let nonzero=0;for(let i=3;i<bytes.length;i+=4)nonzero+=bytes[i]!==0;if(!nonzero)throw Error('emptyPNG '+stage);if(!elide)endpoint.set(wave+stage,b);else{const base=await createImageBitmap(endpoint.get(wave+stage)),oldCanvas=document.createElement('canvas');oldCanvas.width=base.width;oldCanvas.height=base.height;const g=oldCanvas.getContext('2d');g.drawImage(base,0,0);base.close();const old=g.getImageData(0,0,oldCanvas.width,oldCanvas.height).data;if(old.length!==bytes.length)throw Error('PNG dimensions');let changed=0,max=0;for(let i=0;i<bytes.length;i++){const d=Math.abs(bytes[i]-old[i]);changed+=d!==0;max=Math.max(max,d)}row.comparisons.push({name:wave+'-'+stage+'-wholeRGBA',bytes:bytes.length,changed,max});oldCanvas.width=oldCanvas.height=0}row.states.push({stage,nonzero,bytes:bytes.length});
    if(stage==='undo-clear'||stage==='redo-clear'){
      const original=await createImageBitmap(endpoint.get(wave+'final')),baseCanvas=document.createElement('canvas');baseCanvas.width=original.width;baseCanvas.height=original.height;const g=baseCanvas.getContext('2d');g.drawImage(original,0,0);original.close();const old=g.getImageData(0,0,baseCanvas.width,baseCanvas.height).data;let changed=0;for(let i=0;i<bytes.length;i++)changed+=old[i]!==bytes[i];baseCanvas.width=baseCanvas.height=0;row.states.at(-1).vsOriginalFinalChanged=changed;
      if(stage==='undo-clear'&&!changed)throw Error('undo did not restore any pre-clear pixels');if(stage==='redo-clear'&&changed)throw Error('redo does not restore original final');
    }
    c.width=c.height=0;return b;}
  try {
   e.setBaseLayers(['background','layer-1']);e.setActiveLayer('layer-1');e.setCompositeOrder([{id:'background',opacity:1},{id:'layer-1',opacity:1}]);await e.paperReady();
   row.flags={async:e._wcAsyncFinish,zero:e._wcZeroPigmentContacts,phase:e._settlePlan.diagnosticPlateauPhase,fibres:e._wcGradientFibres,source:e._wcSourceFilmRebase,split:e._settlePlan.splitQuanta,lazy:e._settlePlan.lazyContacts,band:e._ribbonPainter.diagnosticBandBatch};row.gpu=e.gpuInfo();
   const selected=clearedInBatch(input.ops,e.liveLayerIds());if(selected.size!==9)throw Error('target9 selection');row.selected=[...selected];const unpainted=undoneInBatch(input.ops);if(elide)for(const id of selected)unpainted.add(id);row.counts.skipped=unpainted.size;
   const paint=e._paintDabs;e._paintDabs=function(...a){row.counts.paint++;return paint.apply(this,a)};
   const op=e._watercolorPasses.fieldOp;e._watercolorPasses.fieldOp=function(...a){if(a[3]===15){row.counts.carryP++;if(executingSequence===47)row.counts.targetCarryP++}if(a[3]===16){row.counts.carryC++;if(executingSequence===47)row.counts.targetCarryC++}return op.apply(this,a)};
   const front=e._watercolorPasses.waterFrontStep;e._watercolorPasses.waterFrontStep=function(...a){row.counts.front++;if(executingSequence===47)row.counts.targetFront++;return front.apply(this,a)};
   const plan=e._settlePlan,fieldFor=plan.ctx.fieldFor,prepare=plan.prepare;
   plan.ctx.fieldFor=function(...a){lastField=fieldFor.apply(this,a);return lastField};
   plan.prepare=function(...a){row.counts.prepare++;const ownerSequence=sequence,job=prepare.apply(this,a),ownedField=lastField,scratch=a[0];if(job){const wrapped=new WeakMap();const wrap=f=>{if(typeof f!=='function')return f;if(wrapped.has(f))return wrapped.get(f);const w=function(...args){const prior=executingSequence;executingSequence=ownerSequence;try{return f.apply(this,args)}finally{executingSequence=prior}};wrapped.set(f,w);wrapped.set(w,w);return w};for(let i=0;i<job.ops.length;i++)job.ops[i]=wrap(job.ops[i]);const splice=job.ops.splice;job.ops.splice=function(start,count,...items){return splice.call(this,start,count,...items.map(wrap))};}if(job&&wave==='correctness'){claimOriginalTarget(ownerSequence,job,()=>{row.targetPaints=(a[12]??scratch).paints.size;row.counts.targetFinish++;field('final-cost',ownedField.pressure);let tile=0;for(const[,entry]of scratch.tileEntries()){for(const key of ['inkLoad','inkColor','solventLoad','coverage'])field('tile'+tile+':'+key,entry[key]);tile++;}partial('captured-final-material')})}return job};
   Date.now=()=>input.ops.at(-1).timestamp;
   const started=performance.now();e.suspendDisplay();e.setUnpaintedInBatch(unpainted);
   try{for(const op of input.ops){sequence=op.seq;e.appendOperation(op,'remote');partial('journal');await new Promise(r=>requestAnimationFrame(r));}}finally{e.setUnpaintedInBatch(null);e.resumeDisplay();}
   await idle();row.durations.journalWall=performance.now()-started;row.durations.materialReadback=readbackMs;row.durations.timingClean=wave==='timing';
   if(e._log.entries.length!==47||e._log.entries.some((q,i)=>q.serverSeq!==i+1||q.pending))throw Error('full47 canonical log');row.log=e._log.entries.map(q=>({id:q.op.id,seq:q.serverSeq,state:q.state}));
   row.finalPNG=await png('final');delete row.finalPNG;
   if(wave==='correctness'){
    if(row.counts.targetFinish!==1||!row.counts.targetCarryP||(row.targetPaints>1&&!row.counts.targetCarryC)||!row.counts.targetFront)throw Error('target physical invocation');for(const suffix of [':inkLoad',':inkColor',':solventLoad',':coverage'])if(!row.fieldStats.some(s=>s.name.endsWith(suffix)&&s.nonzero))throw Error('nonempty '+suffix);
    if(elide){fields.clear();retainedBytes=0;}
    sequence=48;e.appendOperation({id:'qa-clear-undo48',seq:48,type:'operation_undo',targetOpId:clear.id,userId:clear.userId,timestamp:input.ops.at(-1).timestamp+1},'remote');await idle();const undone=e._log.entries.find(q=>q.op.id===clear.id);if(undone?.state!=='undone')throw Error('clear not undone');await png('undo-clear');
    if(!e._log.entries.some(q=>q.op.id===input.ops[0].id&&q.state==='done'))throw Error('suppressed prefix lost');
    sequence=49;e.appendOperation({id:'qa-clear-redo49',seq:49,type:'operation_redo',targetOpId:clear.id,userId:clear.userId,timestamp:input.ops.at(-1).timestamp+2},'remote');await idle();if(e._log.entries.find(q=>q.op.id===clear.id)?.state!=='done')throw Error('clear not redone');await png('redo-clear');
   }
   row.gl=e.gl.getError();row.lost=e.gl.isContextLost();partial('arm-finished');if(row.gl||row.lost||row.comparisons.some(c=>c.changed))throw Error('exact/GL gate');results.push(row);
  }finally{Date.now=clock;canvas.remove();e.destroy();partial('destroyed');}
 }
 return{results,inputCount:47,scope:'standalone canonical replay with one rAF per append; unchanged journal/timestamps; timing includes dispatch cadence, not literal Room load or native FPS'};
}
