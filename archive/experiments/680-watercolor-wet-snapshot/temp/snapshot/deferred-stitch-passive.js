// Passive harness only. NO GL calls, framebuffer queries, pixel reads or GPU work.
(() => {
  const E=window.__engine;if(!E)throw Error('Engine required');window.__wcStitchTrace?.dispose();
  const events=[],restores=[],ids=new WeakMap(),watched=new WeakSet(),opsJobs=new WeakMap(),copyProtos=new WeakSet(),roles=new WeakMap();let nextId=1,nextJob=1,activeOp=null;
  const id=x=>x&&typeof x==='object'?(ids.get(x)??(ids.set(x,nextId),nextId++)):null;
  const buffer=b=>b?{buffer:id(b),fbo:id(b.fbo),texture:id(b.texture),w:b.width,h:b.height}:null;
  const owner=s=>s===E._wash?.scratch?'native':([...E._replayRibbonChunks].find(([,c])=>c.scratch===s)?.[0]??'auxiliary');
  const view=s=>({scratch:id(s),owner:owner(s),gesture:s.gesture,waterUsed:s.waterUsed,pigmentUsed:s.pigmentUsed,lastKept:s.lastKept?{x:s.lastKept.x,y:s.lastKept.y,t:s.lastKept.t}:null,tiles:[...s.tileEntries()].map(([tile,e])=>({target:buffer(tile),filmGesture:e.filmGesture,solventGesture:e.solventGesture,...Object.fromEntries(['inkLoad','inkBase','strokeInk','inkColor','colorBase','strokeColor','inkSettled','colorSettled','coverage','solventLoad','foreignSolventLoad'].map(k=>[k,(e[k]&&(roles.set(e[k],{scratch:s,role:k})),buffer(e[k]))]))}))});
  const emit=(kind,data={})=>{if(events.length<4096)events.push({kind,at:performance.now(),...data});};
  const wrap=(o,name,make)=>{const fn=o[name];if(typeof fn!=='function')throw Error('Missing '+name);restores.push([o,name,fn]);o[name]=make(fn);};
  const watch=s=>{
    if(!s||watched.has(s))return;watched.add(s);
    wrap(s,'newFilm',fn=>function(...a){emit('new-film-before',{state:view(this)});const r=fn.apply(this,a);emit('new-film-after',{state:view(this)});return r;});
    wrap(s,'releaseFilm',fn=>function(...a){emit('release-film-before',{args:a,state:view(this)});const r=fn.apply(this,a);emit('release-film-after',{state:view(this)});return r;});
    wrap(s,'filmBuffers',fn=>function(tile,...a){const previous=this.peek(tile)?.filmGesture,r=fn.call(this,tile,...a);if(previous!==this.peek(tile)?.filmGesture)emit('film-base-captured',{previous,target:buffer(tile),state:view(this)});return r;});
  };
  wrap(E._settlePlan,'prepare',fn=>function(...args){
    const scratch=args[0];watch(scratch);installCopy(args[1][0]?.buffer);const capturedGesture=scratch.gesture,jobId=nextJob++;
    emit('prepare-before',{jobId,capturedGesture,bounds:{...args[2]},state:view(scratch)});
    const job=fn.apply(this,args);if(!job){emit('prepare-null',{jobId});return job;}
    const stitchIndices=job.ops.flatMap((op,i)=>{const s=String(op);return s.includes('field.a.clear()')&&s.includes('snapshots.set(')?[i]:[];});
    if(stitchIndices.length!==1)throw Error('Expected exactly one identifiable deferred stitch; found '+stitchIndices.length);
    const stitchIndex=stitchIndices[0];opsJobs.set(job.ops,{jobId,capturedGesture,stitchIndex});
    job.ops=job.ops.map((op,index)=>function(...a){const previous=activeOp;activeOp={jobId,capturedGesture,index,stitch:index===stitchIndex,scratch};
      if(index===stitchIndex)emit('stitch-before',{jobId,capturedGesture,index,state:view(scratch),selectedInputs:[...scratch.tileEntries()].map(([tile,e])=>({target:buffer(tile),load:buffer(e.inkLoad),settled:buffer((e.filmGesture===capturedGesture?e.inkBase:null)??e.inkSettled??e.inkLoad),fallback:e.filmGesture===capturedGesture&&e.inkBase?'base':e.inkSettled?'settled':'current-load'}))});
      try{return op.apply(this,a);}finally{if(index===stitchIndex)emit('stitch-after',{jobId,capturedGesture,index,state:view(scratch)});activeOp=previous;}
    });
    opsJobs.set(job.ops,{jobId,capturedGesture,stitchIndex});
    const finish=job.finish;job.finish=function(...a){emit('solver-finish-before',{jobId,capturedGesture,state:view(scratch)});try{return finish.apply(this,a);}finally{emit('solver-finish-after',{jobId,capturedGesture,state:view(scratch)});}};
    emit('prepare-after',{jobId,capturedGesture,stitchIndex,ops:job.ops.length,state:view(scratch)});return job;
  });
  wrap(E,'_startSettle',fn=>function(scratch,ops,...a){watch(scratch);emit('queue-start',{job:opsJobs.get(ops)??null,type:opsJobs.has(ops)?'solver':'drawing',state:view(scratch)});return fn.call(this,scratch,ops,...a);});
  wrap(E._ribbonPainter,'paint',fn=>function*(...a){const scratch=a[6];watch(scratch);if(!a[12]?.segmented)emit('paint-before',{preset:a[3],dabs:a[1].length,waterOnly:!!a[12]?.waterOnly,state:view(scratch)});yield* fn.apply(this,a);});
  for (const method of ['_paintStrokeDabs','_flushStrokeChunk','_flushLiveComposite','_refreshTip']) {
    if(typeof E[method]!=='function')continue;
    wrap(E,method,fn=>function(...a){const scratch=this._ribbonStrokeScratch;watch(scratch);emit(method+'-before',{pending:!!this._settle,state:scratch?view(scratch):null});try{return fn.apply(this,a);}finally{emit(method+'-after',{pending:!!this._settle,state:scratch?view(scratch):null});}});
  }
  // Capture actual stitch copy sources; observe existing calls only.
  wrap(E._watercolorPasses,'wcResample',fn=>function(...a){if(activeOp?.stitch)emit('stitch-resample',{jobId:activeOp.jobId,index:activeOp.index,dst:buffer(a[0]),src:buffer(a[5]),mode:a[9],rect:a.slice(1,5)});return fn.apply(this,a);});
  const installCopy=sample=>{if(!sample)return;const proto=Object.getPrototypeOf(sample);if(copyProtos.has(proto))return;copyProtos.add(proto);
    wrap(proto,'copyRegionInto',fn=>function(...a){if(activeOp?.stitch)emit('stitch-copy',{jobId:activeOp.jobId,index:activeOp.index,src:buffer(this),dst:buffer(a[0]),rect:a.slice(1)});return fn.apply(this,a);});
  };
  wrap(E,'_fieldOp',fn=>function(...a){const role=roles.get(a[0]);if(role&&!activeOp?.stitch)emit('source-field-write',{scratch:id(role.scratch),gesture:role.scratch.gesture,role:role.role,out:buffer(a[0]),a:buffer(a[1]),b:buffer(a[2]),mode:a[3],jobId:activeOp?.jobId??null});return fn.apply(this,a);});
  window.__wcStitchTrace={report:()=>JSON.parse(JSON.stringify({source:'9eb2a6fe',scope:'passive identities/chronology only; zero GL queries/readbacks',events,capped:events.length>=4096})),dispose(){for(const[o,k,fn]of restores.reverse())o[k]=fn;delete window.__wcStitchTrace;}};return 'installed';
})()
