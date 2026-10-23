(() => {
  window.__nativePerf = async ({ scenario='densezigzag', size=80, legs=8, legMs=300, perFrame=2, tailLimitMs=45000, stamp='696a8068', idleBatch=false }={}) => {
    const e=window.__engine, p=e?._pointer, gl=e?.gl;
    if(!e||!p||gl.isContextLost())throw Error('Healthy native engine required');
    const originalIdleBatch=e._settleQueue.idleBatch;e._settleQueue.idleBatch=!!idleBatch;
    if(document.visibilityState!=='visible')throw Error('Visible foreground page required');
    const canvas=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
    const rect=canvas.getBoundingClientRect(), debug=gl.getExtension('WEBGL_debug_renderer_info');
    if(typeof p._transform!=='function')throw Error('Actual PointerInput camera transform required');
    const {w:pw,h:ph}=e._pageSize();if(!pw||!ph)throw Error('Bounded A2 page required');
    const origin=p._transform(0,0),bx=p._transform(1,0),by=p._transform(0,1);
    const ax=bx.x-origin.x,ay=bx.y-origin.y,cx=by.x-origin.x,cy=by.y-origin.y,det=ax*cy-ay*cx;
    if(Math.abs(det)<1e-9)throw Error('Invalid affine camera');
    const worldToClient=(x,y)=>{const dx=x-origin.x,dy=y-origin.y;return[(cy*dx-cx*dy)/det,(-ay*dx+ax*dy)/det]};
    const spanX=Math.min(pw*.35,size*legs*.4),spanY=Math.min(ph*.4,Math.max(240,size*4));
    const pathWorld=Array.from({length:legs+1},(_,i)=>[pw*.5-spanX*.5+spanX*i/legs,ph*.5+(i%2?.5:-.5)*spanY]);
    const pathClient=pathWorld.map(q=>worldToClient(...q));
    for(let i=0;i<pathWorld.length;i++){const [wx,wy]=pathWorld[i],[sx,sy]=pathClient[i];if(wx-size<0||wy-size<0||wx+size>pw||wy+size>ph||sx<Math.max(rect.left,0)+25||sx>Math.min(rect.right,innerWidth)-25||sy<Math.max(rect.top,0)+60||sy>Math.min(rect.bottom,innerHeight)-40)throw Error('Path or brush footprint outside visible paper; fit camera before benchmark');}
    
    const flags=Object.fromEntries(['diagnosticSegmentDelivery','diagnosticPigmentRecord','diagnosticSharedFluid','diagnosticLandingReservoir','diagnosticSolventField','diagnosticCanonicalSettleRadius','diagnosticLandingPolicy','diagnosticWaterPolicy','diagnosticForeignSolvent'].map(k=>[k,e._ribbonPainter[k]]));
    const passport={stamp,idleBatch:e._settleQueue.idleBatch,appVersion:globalThis.__APP_VERSION__??null,ua:navigator.userAgent,timeOrigin:performance.timeOrigin,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],canvas:[canvas.width,canvas.height],page:[pw,ph],renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),maxTexture:gl.getParameter(gl.MAX_TEXTURE_SIZE),maxTouchPoints:navigator.maxTouchPoints,pathWorld,pathClient,cameraAffine:{origin,bx,by},flags,visibility:document.visibilityState};
    const saved={drawArrays:gl.drawArrays,drawElements:gl.drawElements,paint:e._paintDabs,display:e._display,complete:e._completeSettle,capture:canvas.setPointerCapture,release:canvas.releasePointerCapture};
    const emit=event=>{if(window.__perfEvent)window.__perfEvent({at:performance.now(),...event}).catch(()=>{})};
    const longTasks=[],loaf=[],samples=[],phases=[],handlerMs=[],latencies=[],forcedSettleMs=[];
    let phase='baseline',draws=0,elements=0,vertices=0,firstPaint=null,firstDraw=null,firstDisplay=null,downAt=null,closed=false;
    const observers=[],observerSupport={};
    for(const [type,target] of [['longtask',longTasks],['long-animation-frame',loaf]])try{const o=new PerformanceObserver(list=>{for(const x of list.getEntries())target.push({start:x.startTime,ms:x.duration})});o.observe({type,buffered:false});observers.push([o,target]);observerSupport[type]=true;}catch{observerSupport[type]=false;}
    gl.drawArrays=function(mode,first,count){draws++;vertices+=count;if(downAt!==null&&firstDraw===null)firstDraw=performance.now()-downAt;return saved.drawArrays.call(this,mode,first,count)};
    gl.drawElements=function(...args){elements++;return saved.drawElements.apply(this,args)};
    e._paintDabs=function(...args){if(downAt!==null&&firstPaint===null)firstPaint=performance.now()-downAt;return saved.paint.apply(this,args)};
    e._display=function(...args){const out=saved.display.apply(this,args);if(downAt!==null&&firstPaint!==null&&firstDisplay===null)firstDisplay=performance.now()-downAt;return out};
    e._completeSettle=function(...args){const started=performance.now(),pendingOps=e._settle?e._settle.ops.length-e._settle.next:0;emit({kind:'forced-complete-enter',phase,pendingOps});try{return saved.complete.apply(this,args)}finally{forcedSettleMs.push({phase,pendingOps,ms:performance.now()-started});emit({kind:'forced-complete',...forcedSettleMs.at(-1)})}};
    canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
    const memory=()=>({js:performance.memory?.usedJSHeapSize??null,...e.getWatercolorPerf()});
    const snapshot=()=>({at:performance.now(),phase,draws,elements,vertices,memory:memory(),queue:e._opQueue.length,settle:!!e._settle,rebuild:e._rebuildJobs.size,reveals:e._washReveals.size,settleNext:e._settle?.next??null,settleTotal:e._settle?.ops.length??null,foreignImported:(e._ribbonStrokeScratch??e._wash?.scratch)?.foreignImportedGestures?.size??null,waterSources:(e._ribbonStrokeScratch??e._wash?.scratch)?.foreignSources?.length??null,washIds:[...new Set(e.getOperations().filter(o=>o.type==='stroke').map(o=>o.washId))],lost:gl.isContextLost()});
    const mark=(name)=>{phase=name;phases.push(snapshot());emit({kind:'phase',phase,state:phases.at(-1)})};
    const times=[],frame=(t)=>{if(closed)return;times.push({t,phase});if(!samples.length||t-samples[samples.length-1].at>=500){samples.push(snapshot());emit({kind:'sample',phase,state:samples.at(-1)})}requestAnimationFrame(frame)};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const mk=(x,y,t,buttons)=>{const v={clientX:x,clientY:y,pressure:0.8,tiltX:0,tiltY:0,twist:0,width:1,height:1,pointerType:'pen',pointerId:713,isPrimary:true,button:0,buttons,timeStamp:t,target:canvas,currentTarget:canvas,preventDefault(){},stopPropagation(){},getCoalescedEvents(){return[v]},getPredictedEvents(){return[]}};return v};
    const at=t=>{t=Math.max(0,Math.min(legs*legMs,t));const i=Math.min(legs-1,Math.floor(t/legMs)),f=Math.min(1,(t-i*legMs)/legMs);return[pathClient[i][0]+(pathClient[i+1][0]-pathClient[i][0])*f,pathClient[i][1]+(pathClient[i+1][1]-pathClient[i][1])*f]};
    const stroke=async (name,preset)=>{
      e.setTool('watercolor');e.setPencil(preset);e.setColor([0.3,0.15,0.55]);e.setSize(size);
      mark(name);const pendingBeforeDown={settleOps:e._settle?e._settle.ops.length-e._settle.next:0,queue:e._opQueue.length,rebuild:e._rebuildJobs.size};firstPaint=firstDraw=firstDisplay=null;downAt=performance.now();const t0=downAt;let last=t0;
      emit({kind:'down-enter',phase:name,pendingBeforeDown});const q=at(0),downWork=performance.now();p._handleDown(mk(...q,t0,1));handlerMs.push({phase:name,kind:'down',ms:performance.now()-downWork});emit({kind:'down-exit',...handlerMs.at(-1)});
      await new Promise((resolve,reject)=>{const tick=now=>{try{now=Math.max(last,now);const h=performance.now(),coalesced=[];for(let k=1;k<=perFrame;k++){const ts=last+(now-last)*k/perFrame;coalesced.push(mk(...at(Math.min(legs*legMs,ts-t0)),ts,1));}const v=coalesced[coalesced.length-1];v.getCoalescedEvents=()=>coalesced;p._handleMove(v);handlerMs.push({phase:name,kind:'move',ms:performance.now()-h});last=now;if(now-t0<legs*legMs)requestAnimationFrame(tick);else{const upWork=performance.now();p._handleUp(mk(...at(legs*legMs),now,0));handlerMs.push({phase:name,kind:'up',ms:performance.now()-upWork});resolve();}}catch(error){emit({kind:'native-callback-error',phase:name,message:String(error),stack:error?.stack});reject(error)}};requestAnimationFrame(tick)});
      latencies.push({phase:name,pendingBeforeDown,firstPaintSubmissionMs:firstPaint,firstAnyGLDrawMs:firstDraw,firstDisplayAfterPaintMs:firstDisplay,penActiveMs:performance.now()-t0});downAt=null;mark(name+'-settle');
    };
    const idle=()=>!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size;
    const tail=async (limit)=>{const start=performance.now();let idleSince=null,firstSolverIdle=null;while(performance.now()-start<limit){if(gl.isContextLost())throw Error('WebGL context lost');if(idle()){firstSolverIdle??=performance.now()-start;if(e._washReveals.size){idleSince=null;if(phase!=='morph')mark('morph');}else{idleSince??=performance.now();if(phase!=='settled-idle')mark('settled-idle');if(performance.now()-idleSince>700&&performance.now()-start>2500)return{ms:performance.now()-start,solverIdleMs:firstSolverIdle,completed:true};}}else idleSince=null;await wait(100);}return{ms:performance.now()-start,solverIdleMs:firstSolverIdle,completed:false};};
    let result;
    try{
      requestAnimationFrame(frame);await wait(500);const before=memory();
      if(scenario==='burst'){for(let n=0;n<3;n++){await stroke('burst-'+(n+1),'normal:100:100:PB29:round');if(n<2)await wait(150);}}
      else if(scenario==='waterthenpigment'){await stroke('water','normal:100:0:PB29:round');await wait(200);await stroke('pigment','normal:0:100:PB29:round');}
      else await stroke('active',scenario==='purewater'?'normal:100:0:PB29:round':'normal:100:100:PB29:round');
      const settling=await tail(tailLimitMs);mark('background');await wait(1500);
      const after=memory();closed=true;
      for(const [o,target]of observers){for(const x of o.takeRecords())target.push({start:x.startTime,ms:x.duration});o.disconnect();}
      const stats=values=>{const s=[...values].sort((a,b)=>a-b),q=f=>s.length?s[Math.floor((s.length-1)*f)]:0;return{n:s.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1),over33:s.filter(x=>x>33).length,over100:s.filter(x=>x>100).length,over200:s.filter(x=>x>200).length}};
      const grouped={};for(let i=1;i<times.length;i++){const name=times[i].phase;(grouped[name]??=[]).push(times[i].t-times[i-1].t)}
      const baselineP50=stats(grouped.baseline||[]).p50;const relativeFrameRates=Object.fromEntries(Object.entries(grouped).map(([name,values])=>[name,{medianHz:stats(values).p50?1000/stats(values).p50:0,excessOverBaseline1_5:values.filter(v=>v>baselineP50*1.5).length,baselineMedianHz:baselineP50?1000/baselineP50:0}]));
      result={relativeFrameRates,passport,observerSupport,scenario,size,legs,legMs,perFrame,latencies,settling,frameStats:Object.fromEntries(Object.entries(grouped).map(([k,v])=>[k,stats(v)])),handlerStats:stats(handlerMs.map(x=>x.ms)),handlerMs,forcedSettleMs,longTasks,longTasksOver200:longTasks.filter(x=>x.ms>200),loaf,draws,elements,vertices,before,after,samples,phases,gl:{lost:gl.isContextLost(),error:gl.getError()},limitation:'Native PointerInput handlers with synthetic coalesced pen input; first submission/display is not photon-visible latency. No readPixels or gl.finish in frame loop.'};
      return result;
    }finally{e._settleQueue.idleBatch=originalIdleBatch;closed=true;for(const [o]of observers)o.disconnect();gl.drawArrays=saved.drawArrays;gl.drawElements=saved.drawElements;e._paintDabs=saved.paint;e._display=saved.display;e._completeSettle=saved.complete;canvas.setPointerCapture=saved.capture;canvas.releasePointerCapture=saved.release;}
  };
  return 'native performance probe installed';
})();
