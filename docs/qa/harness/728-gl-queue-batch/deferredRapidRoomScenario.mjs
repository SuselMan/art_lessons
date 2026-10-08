/** Diagnostic interpolation accepts lagging RAF timestamps without a negative point index. */
export function gestureFraction(rafTimestamp,downAt,duration){
 if(!Number.isFinite(rafTimestamp)||!Number.isFinite(downAt)||!Number.isFinite(duration)||duration<=0)throw Error('Finite positive gesture clock required');
 return Math.max(0,Math.min(1,(rafTimestamp-downAt)/duration));
}
/** Runs real Room PointerInput handlers with coalesced in-page pen samples.
 * CPU submission onset is NOT measured physical touch-to-screen latency. */
export async function runDeferredRapidScenario({onPhase=()=>{},expectedDeferred,probeUrl}={}){
 const E=window.__engine,S=window.__roomStore.getState(),c=[...document.querySelectorAll('canvas')].find(n=>n.className.includes('canvas')&&n.width>500)
 if(!E||!c||getComputedStyle(c).pointerEvents==='none'||E._locked||!E._paper.loaded||E.gl.isContextLost())throw Error('Room not drawable')
 if(E._wcJoinedFinishDeferred!==expectedDeferred||!E._wcJoinedTouchMixed||!E._settleQueue.diagnosticSolverBatchEnabled)throw Error('Strict rapid flags mismatch');
 const m=E._camera.screenToWorldMatrix(),sx=c.width*.52,sy=c.height*.47,den=m[2]*sx+m[5]*sy+m[8],worldPoint=[(m[0]*sx+m[3]*sy+m[6])/den,(m[1]*sx+m[4]*sy+m[7])/den];const probe=(await import(probeUrl)).installDeferredOwnershipTimeline(E,{readback:true,worldPoint});
 const r=c.getBoundingClientRect(),p=E._pointer,rows=[],frames=[],start=performance.now();let collecting=true,active=null,raf=0
 const capture=c.setPointerCapture,release=c.releasePointerCapture;c.setPointerCapture=()=>{};c.releasePointerCapture=()=>{}
 const origDraw=E.gl.drawArrays,origDisplay=E._display
 E.gl.drawArrays=function(...a){if(active&&active.firstDrawSubmitMs===null)active.firstDrawSubmitMs=performance.now()-active.downAt;return origDraw.apply(this,a)}
 E._display=function(...a){const result=origDisplay.apply(this,a);if(active&&active.firstDisplaySubmitMs===null)active.firstDisplaySubmitMs=performance.now()-active.downAt;return result}
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve))
 const collect=t=>{frames.push({at:t-start,phase:active?.name??'between'});if(collecting)raf=requestAnimationFrame(collect)};raf=requestAnimationFrame(collect)
 const event=(x,y,t,buttons)=>{const ev={clientX:r.left+r.width*x,clientY:r.top+r.height*y,pressure:.8,tiltX:0,tiltY:0,twist:0,width:1,height:1,pointerType:'pen',pointerId:728,isPrimary:true,button:0,buttons,timeStamp:t,target:c,currentTarget:c,preventDefault(){},stopPropagation(){},getCoalescedEvents(){return[ev]},getPredictedEvents(){return[]}};return ev}
 const stroke=async(name,pigment,pts,ms=500,immediate=false)=>{
  S.setToolSetting('watercolor','pigment',pigment);if(!immediate){await frame();await frame()}
  E.setTool('watercolor');E.setSize(400);E.setPencil(`normal:100:${Math.round(pigment*100)}:PB29:round`);E.setColor([.3,.15,.55])
  const row={name,pigment,beforeDown:{settle:!!E._settle,settleNext:E._settle?.next??null,settleOps:E._settle?.ops.length??0,canonicalQueued:E._wcCanonical?.queuedRequestCount??null,locked:E._locked},downAt:performance.now(),firstDrawSubmitMs:null,firstDisplaySubmitMs:null};active=row;onPhase(name)
  p._handleDown(event(...pts[0],row.downAt,1));row.downCpuMs=performance.now()-row.downAt;row.started=!!E._strokeId;row.gestureId=E._strokeId
  if(!row.started)throw Error('No actual pointer stroke')
  let last=row.downAt
  for(let step=1;step<=8;step++){const scheduled=row.downAt+ms*step/8;while(performance.now()<scheduled)await frame();const now=scheduled,f=step/8,pos=f*(pts.length-1),i=Math.min(pts.length-2,Math.floor(pos)),k=pos-i,x=pts[i][0]+(pts[i+1][0]-pts[i][0])*k,y=pts[i][1]+(pts[i+1][1]-pts[i][1])*k;
   const ev=event(x,y,now,1);ev.getCoalescedEvents=()=>[event(x,y,last+(now-last)/2,1),ev];p._handleMove(ev);last=now}

  row.upAt=performance.now();p._handleUp(event(...pts.at(-1),row.downAt+ms+1,0));row.upCpuMs=performance.now()-row.upAt;row.settleAfterUp=!!E._settle;active=null;onPhase("between");rows.push(row)
 }
 try{
  await stroke('first-pigment',1,[[.42,.4],[.48,.57],[.54,.4],[.60,.57]],500)
  const firstUp=rows[0].upAt;while(performance.now()-firstUp<200)await frame()
  await stroke('second-pigment-during-settle',1,[[.46,.41],[.52,.56],[.58,.41]],500)
  const heldBeforeThird=!!E._wcJoinedDeferred;if(expectedDeferred&&!heldBeforeThird)throw Error('Third DOWN lacked deferred held owner');probe.mark('third-before-down','fixture');
  await stroke('third-immediate-pigment',1,[[.46,.47],[.58,.47]],450,true)
  const end=performance.now()+60000;while(E._settle||E._rebuildJobs.size||E._unsettledLayers.size){if(performance.now()>end)throw Error('Final settle timeout');await frame()}
  for(let i=0;i<3;i++)await frame()
  const gaps=frames.slice(1).map((f,i)=>({ms:f.at-frames[i].at,phase:f.phase})),sorted=gaps.map(x=>x.ms).sort((a,b)=>a-b)
  return{inputRecipe:{movesPerGesture:8,coalesced:2,pressure:.8,size:400,water:100,pigment:100,firstTwoMs:500,thirdMs:450,firstPauseMs:200,thirdImmediate:true},timeline:probe.snapshot(),heldBeforeThird,worldPoint,rows:rows.map(row=>({...row,downAt:row.downAt-start,upAt:row.upAt-start})),frames,gaps,frameP95:sorted[Math.floor((sorted.length-1)*.95)],frameMax:Math.max(...sorted),over33:gaps.filter(x=>x.ms>33).length,over100:gaps.filter(x=>x.ms>100).length,elapsedMs:performance.now()-start,operations:E.getOperations().map(o=>({id:o.id,type:o.type,preset:o.preset,wet:o.wet})),glError:E.gl.getError(),lost:E.gl.isContextLost(),flags:{solver:E._settleQueue.diagnosticSolverBatchEnabled,joinedTouch:E._wcJoinedTouch,joinedMixed:E._wcJoinedTouchMixed,deferred:E._wcJoinedFinishDeferred,asyncFinish:E._wcAsyncFinish,material:E._wcMaterialPresentation},limitations:['In-page real PointerInput, not physical stylus/CDP OS input','firstDraw/Display are CPU submission timestamps, not actual scanned-out pixels','Ownership/framebuffer probe readbacks perturb timing; no latency or physical onset claims']}
 }finally{probe.detach();collecting=false;cancelAnimationFrame(raf);E.gl.drawArrays=origDraw;E._display=origDisplay;c.setPointerCapture=capture;c.releasePointerCapture=release}
}
