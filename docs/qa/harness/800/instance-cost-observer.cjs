// QA-only instance instrumentation. No draws, reads, fences, or flag writes added.
function installInstanceCostObserver(engine, miniState) {
  const restores=[], stack=[], rows={}, reads=[], events=[], raf=[];
  let phase='idle', active=false, finished=false, stable=0, upAt=null, downAt=null, readyAt=null, lastRAF;
  const flags=()=>({asyncFinish:engine._wcAsyncFinish,materialPresentation:engine._wcMaterialPresentation,joinedTouch:engine._wcJoinedTouch,model:engine._watercolorModel,optsModel:engine._opts?.watercolorModel,bandBatch:engine._ribbonPainter?.diagnosticBandBatch,blot:engine._ribbonPasses?.diagnosticPigmentBlot,lift:engine.diagnosticWatercolorLiftSteps,minimum:engine.diagnosticNativeFieldMinimum,continuationFence:engine._wcContinuationGpuFence,dryFenceBatch:engine._wcDryGpuFenceBatch});
  const beforeFlags=flags();
  function wrap(object,name,label,countOnly=false) {
    if(!object||typeof object[name]!=='function')return;
    const descriptor=Object.getOwnPropertyDescriptor(object,name), old=object[name];
    object[name]=function(...args){
      if(!active)return old.apply(this,args);
      const key=phase+':'+label, row=rows[key]||(rows[key]={count:0,sumMs:0,maxMs:0,byParent:{}}), parent=stack.at(-1)||'outside';
      row.count++;row.byParent[parent]=(row.byParent[parent]||0)+1;
      if(label==='readPixels') {
        const components=args[4]===engine.gl.RGBA?4:args[4]===engine.gl.RGB?3:1;
        const componentBytes=args[5]===engine.gl.FLOAT?4:args[5]===engine.gl.UNSIGNED_BYTE?1:2;
        row.logicalBytes=(row.logicalBytes||0)+args[2]*args[3]*components*componentBytes;
        if(reads.length<10)reads.push({phase,parent,width:args[2],height:args[3],format:args[4],type:args[5],stack:new Error().stack.slice(0,3500)});
      }
      if(countOnly)return old.apply(this,args);
      const start=performance.now();stack.push(label);
      try{return old.apply(this,args)}finally{const dt=performance.now()-start;stack.pop();row.sumMs+=dt;row.maxMs=Math.max(row.maxMs,dt)}
    };
    restores.push(()=>descriptor?Object.defineProperty(object,name,descriptor):delete object[name]);
  }
  for(const name of ['readPixels','finish'])wrap(engine.gl,name,name);
  for(const name of ['drawArrays','drawElements'])wrap(engine.gl,name,name,true);
  for(const name of ['_advanceAsyncCanonical','_syncContinuationGpu','_showMaterialPresentation','_paintRibbonDabs','_onStart','_onMove','_onEnd'])wrap(engine,name,name);
  function inspect() {
    const p=engine._puddle, layers=[...(p?.layers?.values()||[])];
    const mini=typeof miniState==='function'?miniState():null;
    const error=String(engine._wcAsyncError||'');
    const ready=mini ? !!(mini.goalReady&&!mini.calculating&&!mini.drawing&&mini.target?.done) :
      !!p&&layers.some(l=>p.hasMaterial(l.target))&&!engine._strokeId&&!engine._settle&&!engine._wcCanonical?.pending&&!engine._opQueue?.length&&!engine._rebuildJobs?.size&&!engine._unsettledLayers?.size&&!engine._pendingRebuilds?.size&&!p.state?.pending&&layers.every(l=>!p.hasMaterial(l.target)||(l.goalReady&&!l.dirty));
    return {ready,error,fifo:engine._wcCanonical?.queuedRequestCount||0,owners:engine._wcAsyncOwners?.size||0,stroke:!!engine._strokeId,epochs:layers.map(l=>({epoch:l.epoch,goalReady:l.goalReady,dirty:l.dirty})),mini:mini?{epoch:mini.epoch,goalReady:mini.goalReady,calculating:mini.calculating,drawing:mini.drawing,targetDone:mini.target?.done}:null};
  }
  function event(e){if(e.target!==engine.canvas)return;const at=performance.now();events.push({type:e.type,at,trusted:e.isTrusted,pointerType:e.pointerType});if(e.type==='pointerdown'){active=true;phase='drawing';downAt=at;stable=0}else if(e.type==='pointerup'){upAt=at;phase='postUP';stable=0}}
  for(const type of ['pointerdown','pointerup','pointercancel'])window.addEventListener(type,event,true);
  function loop(t){if(finished)return;if(active){if(lastRAF!==undefined)raf.push(t-lastRAF);lastRAF=t;const q=inspect();if(upAt&&q.ready&&!q.error){if(++stable===2){readyAt=performance.now();active=false}}else stable=0}requestAnimationFrame(loop)}
  requestAnimationFrame(loop);
  return {inspect,flags,snapshot:()=>({beforeFlags,afterFlags:flags(),downAt,upAt,readyAt,drawingMs:upAt===null?null:upAt-downAt,upToReadyMs:readyAt===null?null:readyAt-upAt,rows,firstReadStacks:reads,events,RAF:{count:raf.length,maxMs:Math.max(0,...raf),over50:raf.filter(x=>x>50).length},state:inspect(),visibility:document.visibilityState,qualification:'Inclusive host wall times; nested scopes overlap. Draws counted without extra queries. Input and postUP phases are captured before engine handlers.'}),restore(){active=false;finished=true;for(const type of ['pointerdown','pointerup','pointercancel'])window.removeEventListener(type,event,true);for(const restore of restores.reverse())restore()}};
}
module.exports={installInstanceCostObserver};
