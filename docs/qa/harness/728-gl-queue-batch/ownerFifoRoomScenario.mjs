/** Diagnostic interpolation accepts lagging RAF timestamps without a negative point index. */
export function gestureFraction(rafTimestamp,downAt,duration){
 if(!Number.isFinite(rafTimestamp)||!Number.isFinite(downAt)||!Number.isFinite(duration)||duration<=0)throw Error('Finite positive gesture clock required');
 return Math.max(0,Math.min(1,(rafTimestamp-downAt)/duration));
}
/** Runs real Room PointerInput handlers with coalesced in-page pen samples.
 * CPU submission onset is NOT measured physical touch-to-screen latency. */
export async function runOwnerFifoScenario({onPhase=()=>{},collectAllocationStacks=false,newDownDuringReveal=false,rapidGapMs=200,firstPigment=1,scene='rapid'}={}){
 if(!Number.isFinite(rapidGapMs)||rapidGapMs<0||rapidGapMs>1000)throw Error('Explicit bounded rapid gap required');
 if(!['rapid','water-dab'].includes(scene)||scene==='water-dab'&&(firstPigment!==0||newDownDuringReveal))throw Error('Explicit two-owner water-dab scene required');
 if(![0,1].includes(firstPigment))throw Error('Explicit first water/pigment scenario required');
 const E=window.__engine,S=window.__roomStore.getState(),c=[...document.querySelectorAll('canvas')].find(n=>n.className.includes('canvas')&&n.width>500)
 if(!E||!c||getComputedStyle(c).pointerEvents==='none'||E._locked||!E._paper.loaded||E.gl.isContextLost())throw Error('Room not drawable')
 const r=c.getBoundingClientRect(),p=E._pointer,rows=[],frames=[],start=performance.now();let collecting=true,active=null,raf=0
 const capture=c.setPointerCapture,release=c.releasePointerCapture;c.setPointerCapture=()=>{};c.releasePointerCapture=()=>{}
 const origDraw=E.gl.drawArrays,origDisplay=E._display,origTexture=E.gl.createTexture,origComplete=E._completeSettle
 E.gl.createTexture=function(...args){if(active?.stage==='down'){active.downTextureAllocations++;if(collectAllocationStacks&&active.downTextureAllocationStacks.length<8)active.downTextureAllocationStacks.push(new Error('QA allocation caller').stack)}return origTexture.apply(this,args)}
 E._completeSettle=function(...args){if(active?.stage==='down')active.downCompleteSettle++;return origComplete.apply(this,args)}
 E.gl.drawArrays=function(...a){if(active&&active.firstDrawSubmitMs===null)active.firstDrawSubmitMs=performance.now()-active.downAt;return origDraw.apply(this,a)}
 E._display=function(...a){const result=origDisplay.apply(this,a);if(active&&active.firstDisplaySubmitMs===null)active.firstDisplaySubmitMs=performance.now()-active.downAt;return result}
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve))
 const collect=t=>{frames.push({at:t-start,phase:active?.name??'between'});if(collecting)raf=requestAnimationFrame(collect)};raf=requestAnimationFrame(collect)
 const event=(x,y,t,buttons)=>{const ev={clientX:r.left+r.width*x,clientY:r.top+r.height*y,pressure:.8,tiltX:0,tiltY:0,twist:0,width:1,height:1,pointerType:'pen',pointerId:728,isPrimary:true,button:0,buttons,timeStamp:t,target:c,currentTarget:c,preventDefault(){},stopPropagation(){},getCoalescedEvents(){return[ev]},getPredictedEvents(){return[]}};return ev}
 const stroke=async(name,pigment,pts,ms=500,color=[.3,.15,.55],size=400)=>{
  S.setToolSetting('watercolor','pigment',pigment);S.setToolSetting('watercolor','size',size);await frame();await frame()
  E.setTool('watercolor');E.setSize(size);E.setPencil(`normal:100:${Math.round(pigment*100)}:PB29:round`);E.setColor(color)
  if(E._opts.size!==size)throw Error('Actual engine size mismatch before DOWN');
  const row={name,pigment,requestedSize:size,actualSize:E._opts.size,stage:'down',downTextureAllocations:0,downTextureAllocationStacks:[],downCompleteSettle:0,beforeDown:{settle:!!E._settle,settleNext:E._settle?.next??null,settleOps:E._settle?.ops.length??0,canonicalQueued:E._wcCanonical?.queuedRequestCount??null,activeReveals:[...E._washReveals.values()].filter(reveal=>E._revealHold(reveal,performance.now())>0).length,owners:window.__ownerFifo.snapshot(),locked:E._locked},downAt:performance.now(),firstDrawSubmitMs:null,firstDisplaySubmitMs:null};active=row;onPhase(name)
  p._handleDown(event(...pts[0],row.downAt,1));row.downCpuMs=performance.now()-row.downAt;row.stage='move';row.started=!!E._strokeId;row.gestureId=E._strokeId
  if(!row.started)throw Error('No actual pointer stroke')
  row.ownersAfterDown=window.__ownerFifo.snapshot();let last=row.downAt
  while(true){const now=await frame(),f=gestureFraction(now,row.downAt,ms),pos=f*(pts.length-1),i=Math.min(pts.length-2,Math.floor(pos)),k=pos-i,x=pts[i][0]+(pts[i+1][0]-pts[i][0])*k,y=pts[i][1]+(pts[i+1][1]-pts[i][1])*k
   const ev=event(x,y,now,1);ev.getCoalescedEvents=()=>[event(x,y,last+(now-last)/2,1),ev];p._handleMove(ev);last=now;if(f===1)break}
  row.upAt=performance.now();p._handleUp(event(...pts.at(-1),row.upAt,0));row.upCpuMs=performance.now()-row.upAt;row.settleAfterUp=!!E._settle;active=null;onPhase("between");rows.push(row)
 }
 try{
  if(scene==='water-dab'){await stroke('large-water-puddle',0,[[.42,.48],[.60,.48],[.42,.50]],500);const up=rows[0].upAt;while(performance.now()-up<rapidGapMs)await frame();await stroke('single-pigment-dab',1,[[.51,.49],[.5101,.4901]],40,[.3,.15,.55],70)}else{
  await stroke(firstPigment?'first-pigment':'first-water',firstPigment,[[.42,.4],[.48,.57],[.54,.4],[.60,.57]],500)
  const firstUp=rows[0].upAt;while(performance.now()-firstUp<rapidGapMs)await frame()
  await stroke('second-pigment-during-settle',1,[[.46,.41],[.52,.56],[.58,.41]],500)
  await stroke('third-pigment-held-future',1,[[.48,.43],[.54,.56],[.60,.43]],450)
  }
  const end=performance.now()+90000;while(E._wcCanonical.pending||E._settle||E._rebuildJobs.size){if(performance.now()>end)throw Error('Owner canonical timeout');await frame()}
  if(newDownDuringReveal){if(![...E._washReveals.values()].some(reveal=>E._revealHold(reveal,performance.now())>0))throw Error('Required new DOWN during active reveal not reached');await stroke('fourth-new-color-during-reveal',1,[[.45,.5],[.5,.44],[.57,.5]],350,[.65,.12,.08]);const end=performance.now()+90000;while(E._wcCanonical.pending||E._settle||E._rebuildJobs.size){if(performance.now()>end)throw Error('Fourth owner canonical timeout');await frame()}}
  for(let i=0;i<3;i++)await frame()
  const operationTape=E.getOperations().filter(o=>o.type==='stroke').map(o=>structuredClone(o));if(JSON.stringify(operationTape).length>64*1024)throw Error('Bounded actual packed tape capacity');
  const gaps=frames.slice(1).map((f,i)=>({ms:f.at-frames[i].at,phase:f.phase})),sorted=gaps.map(x=>x.ms).sort((a,b)=>a-b)
  return{operationTape,startedAt:start,rows:rows.map(row=>({...row,downAt:row.downAt-start,upAt:row.upAt-start})),frames,gaps,frameP95:sorted[Math.floor((sorted.length-1)*.95)],frameMax:Math.max(...sorted),over33:gaps.filter(x=>x.ms>33).length,over100:gaps.filter(x=>x.ms>100).length,elapsedMs:performance.now()-start,ownerTrace:[...window.__ownerFifo.trace],owners:window.__ownerFifo.snapshot(),prewarmedBytes:window.__ownerFifo.prewarmedBytes,prewarmedPreviewBytes:window.__ownerFifo.prewarmedPreviewBytes,diagnosticEarlyPreview:window.__ownerFifo.diagnosticEarlyPreview,prewarmedRevealBytes:window.__ownerFifo.prewarmedRevealBytes,prewarmedVisualScratchBytes:window.__ownerFifo.prewarmedVisualScratchBytes,diagnosticMaterialRebase:window.__ownerFifo.diagnosticMaterialRebase,scene,firstPigment,rapidGapMs,newDownDuringReveal,operations:E.getOperations().map(o=>({id:o.id,type:o.type,preset:o.preset,wet:o.wet})),glError:E.gl.getError(),lost:E.gl.isContextLost(),flags:{solver:E._settleQueue.diagnosticSolverBatchEnabled,joinedTouch:E._wcJoinedTouch,joinedMixed:E._wcJoinedTouchMixed,deferred:E._wcJoinedFinishDeferred,asyncFinish:E._wcAsyncFinish,material:E._wcMaterialPresentation},limitations:['In-page real PointerInput, not physical stylus/CDP OS input','firstDraw/Display are CPU submission timestamps, not actual scanned-out pixels','No readPixels or screenshot during timing; screenshots separate']}
 }finally{collecting=false;cancelAnimationFrame(raf);E.gl.drawArrays=origDraw;E._display=origDisplay;E.gl.createTexture=origTexture;E._completeSettle=origComplete;c.setPointerCapture=capture;c.releasePointerCapture=release}
}
