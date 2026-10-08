/** Diagnostic interpolation accepts lagging RAF timestamps without a negative point index. */
export function gestureFraction(rafTimestamp,downAt,duration){
 if(!Number.isFinite(rafTimestamp)||!Number.isFinite(downAt)||!Number.isFinite(duration)||duration<=0)throw Error('Finite positive gesture clock required');
 return Math.max(0,Math.min(1,(rafTimestamp-downAt)/duration));
}
/** Runs real Room PointerInput handlers with coalesced in-page pen samples.
 * CPU submission onset is NOT measured physical touch-to-screen latency. */
export async function runRoomPointerScenario({onPhase=()=>{}}={}){
 const E=window.__engine,S=window.__roomStore.getState(),c=[...document.querySelectorAll('canvas')].find(n=>n.className.includes('canvas')&&n.width>500)
 if(!E||!c||getComputedStyle(c).pointerEvents==='none'||E._locked||!E._paper.loaded||E.gl.isContextLost())throw Error('Room not drawable')
 const r=c.getBoundingClientRect(),p=E._pointer,rows=[],frames=[],start=performance.now();let collecting=true,active=null,raf=0
 const capture=c.setPointerCapture,release=c.releasePointerCapture;c.setPointerCapture=()=>{};c.releasePointerCapture=()=>{}
 const origDraw=E.gl.drawArrays,origDisplay=E._display
 E.gl.drawArrays=function(...a){if(active&&active.firstDrawSubmitMs===null)active.firstDrawSubmitMs=performance.now()-active.downAt;return origDraw.apply(this,a)}
 E._display=function(...a){const result=origDisplay.apply(this,a);if(active&&active.firstDisplaySubmitMs===null)active.firstDisplaySubmitMs=performance.now()-active.downAt;return result}
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve))
 const collect=t=>{frames.push({at:t-start,phase:active?.name??'between'});if(collecting)raf=requestAnimationFrame(collect)};raf=requestAnimationFrame(collect)
 const event=(x,y,t,buttons)=>{const ev={clientX:r.left+r.width*x,clientY:r.top+r.height*y,pressure:.8,tiltX:0,tiltY:0,twist:0,width:1,height:1,pointerType:'pen',pointerId:728,isPrimary:true,button:0,buttons,timeStamp:t,target:c,currentTarget:c,preventDefault(){},stopPropagation(){},getCoalescedEvents(){return[ev]},getPredictedEvents(){return[]}};return ev}
 const stroke=async(name,pigment,pts,ms=500)=>{
  S.setToolSetting('watercolor','pigment',pigment);await frame();await frame()
  E.setTool('watercolor');E.setSize(400);E.setPencil(`normal:100:${Math.round(pigment*100)}:PB29:round`);E.setColor([.3,.15,.55])
  const row={name,pigment,beforeDown:{settle:!!E._settle,settleNext:E._settle?.next??null,settleOps:E._settle?.ops.length??0,canonicalQueued:E._wcCanonical?.queuedRequestCount??null,locked:E._locked},downAt:performance.now(),firstDrawSubmitMs:null,firstDisplaySubmitMs:null};active=row;onPhase(name)
  p._handleDown(event(...pts[0],row.downAt,1));row.downCpuMs=performance.now()-row.downAt;row.started=!!E._strokeId;row.gestureId=E._strokeId
  if(!row.started)throw Error('No actual pointer stroke')
  let last=row.downAt
  while(true){const now=await frame(),f=gestureFraction(now,row.downAt,ms),pos=f*(pts.length-1),i=Math.min(pts.length-2,Math.floor(pos)),k=pos-i,x=pts[i][0]+(pts[i+1][0]-pts[i][0])*k,y=pts[i][1]+(pts[i+1][1]-pts[i][1])*k
   const ev=event(x,y,now,1);ev.getCoalescedEvents=()=>[event(x,y,last+(now-last)/2,1),ev];p._handleMove(ev);last=now;if(f===1)break}
  row.upAt=performance.now();p._handleUp(event(...pts.at(-1),row.upAt,0));row.upCpuMs=performance.now()-row.upAt;row.settleAfterUp=!!E._settle;active=null;onPhase("between");rows.push(row)
 }
 try{
  await stroke('first-pigment',1,[[.42,.4],[.48,.57],[.54,.4],[.60,.57]],500)
  const firstUp=rows[0].upAt;while(performance.now()-firstUp<200)await frame()
  await stroke('second-pigment-during-settle',1,[[.46,.41],[.52,.56],[.58,.41]],500)
  const deadline=performance.now()+60000;while(E._settle||E._rebuildJobs.size||E._unsettledLayers.size){if(performance.now()>deadline)throw Error('Scene settle timeout');await frame()}
  await stroke('pure-water',0,[[.42,.47],[.55,.47]],450)
  const waterUp=rows.at(-1).upAt;while(performance.now()-waterUp<200)await frame()
  await stroke('pigment-over-water',1,[[.44,.47],[.56,.47]],450)
  const end=performance.now()+60000;while(E._settle||E._rebuildJobs.size||E._unsettledLayers.size){if(performance.now()>end)throw Error('Final settle timeout');await frame()}
  for(let i=0;i<3;i++)await frame()
  const gaps=frames.slice(1).map((f,i)=>({ms:f.at-frames[i].at,phase:f.phase})),sorted=gaps.map(x=>x.ms).sort((a,b)=>a-b)
  return{rows:rows.map(row=>({...row,downAt:row.downAt-start,upAt:row.upAt-start})),frames,gaps,frameP95:sorted[Math.floor((sorted.length-1)*.95)],frameMax:Math.max(...sorted),over33:gaps.filter(x=>x.ms>33).length,over100:gaps.filter(x=>x.ms>100).length,elapsedMs:performance.now()-start,operations:E.getOperations().map(o=>({id:o.id,type:o.type,preset:o.preset,wet:o.wet})),glError:E.gl.getError(),lost:E.gl.isContextLost(),flags:{solver:E._settleQueue.diagnosticSolverBatchEnabled,joinedTouch:E._wcJoinedTouch,joinedMixed:E._wcJoinedTouchMixed,deferred:E._wcJoinedFinishDeferred,asyncFinish:E._wcAsyncFinish,material:E._wcMaterialPresentation},limitations:['In-page real PointerInput, not physical stylus/CDP OS input','firstDraw/Display are CPU submission timestamps, not actual scanned-out pixels','No readPixels or screenshot during timing; screenshots separate']}
 }finally{collecting=false;cancelAnimationFrame(raf);E.gl.drawArrays=origDraw;E._display=origDisplay;c.setPointerCapture=capture;c.releasePointerCapture=release}
}
