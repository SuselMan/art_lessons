import {GpuMethodTimer} from '../728-gpu-method-timer/timer.mjs'

/** Separate instrumented arms, never the uninstrumented latency reference. */
export async function runGpuCoverage(engine,{cohort='passes',everyNth=1,maxPending=256}={}){
 if(!['passes','transfers','raster'].includes(cohort))throw Error('Unknown coverage cohort')
 let timer,raf=0;const cpu={},restores=[],targets=[]

 const wrap=(object,names)=>{const present=names.filter(n=>typeof object?.[n]==='function');targets.push({requested:names,present,missing:names.filter(n=>!present.includes(n))});if(present.length)timer.wrap(object,present)}
 const poll=()=>{timer?.poll();raf=requestAnimationFrame(poll)}
 try{
  const report=await engine.runPrototype({backend:'webgl2',scenario:'mixed400',paper:'fine',pageWidth:2048,verifyUndo:false,onPaintPhase(phase,probe){
   if(phase==='start'){
    timer=new GpuMethodTimer(probe.gl,{everyNth,maxPending});
    // CPU API time is separate: a finish may wait for earlier unmeasured commands.
    targets.push({requested:['finish','flush','readPixels'],present:[],missing:['finish','flush','readPixels'],reason:'GL2 adapter caches bound methods; raw monkeypatch cannot faithfully intercept existing calls'});
    if(cohort==='passes')wrap(probe._watercolorPasses,['fieldOp','waterFrontStep','diffuseStep','brushPass','brushPair','carryPair','costDomainStep','wcResample','pigmentColor']);
    if(cohort==='transfers'){
     wrap(engine.AccumulationBuffer.prototype,['copyTo','copyRegionInto','clear','restorePixels','writePixels','restorePixelsRect']);
     // This cohort alone samples raw uploads, avoiding nested pass attribution.
     targets.push({requested:['texImage2D','texSubImage2D','generateMipmap'],present:[],missing:['texImage2D','texSubImage2D','generateMipmap'],reason:'Do not wrap adapted GL proxy: override/raw recursion and bound-cache bypass'});
    }
    if(cohort==='raster'){
     wrap(probe._stamps,['paint']);
     // Unwrapped ribbon/source draws remain visible at the raw leaf boundary.
     targets.push({requested:['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'],present:[],missing:['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'],reason:'Bound GL2 proxy methods cannot be faithfully monkeypatched after init'});
     wrap(probe,['_composeToFBO','_display']);
    }
    raf=requestAnimationFrame(poll)
   }else{
    for(const restore of timer?.restores.splice(0)??[])restore();for(const restore of restores.splice(0))restore()
   }
  }})
  const deadline=performance.now()+15000
  while(timer?.pending.length&&performance.now()<deadline){timer.poll();await new Promise(r=>setTimeout(r,16))}
  timer?.poll()
  return{cohort,targets,cpuApi:cpu,report,timer:timer?.report(),limitations:[
   'Instrumented cohort has query/stack/RAF overhead; compare a separate uninstrumented wall arm',
   'Nested intervals skipped and counted, never sum cohorts as simultaneous elapsed time',
   'GPU query surrounds API command region, upload result may include synchronization; CPU API time separately reported',
   'Init/paper fetch/compile excluded; readback/export after timed tape excluded',
   'Missing methods explicitly reported; does not measure browser compositor/presentation or server/network',
   'Wall minus summed GPU queries is not CPU time; Amdahl requires critical-path attribution']}
 }finally{cancelAnimationFrame(raf);for(const restore of restores.splice(0))restore();timer?.dispose();engine.disposePrototype()}
}
