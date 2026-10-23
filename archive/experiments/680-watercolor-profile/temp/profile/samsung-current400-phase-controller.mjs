import { createRequire } from 'node:module'
const require = createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json')
const WebSocket = require('ws')
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import { execFileSync } from 'node:child_process'

if(process.env.PROFILE_PENDING!=='1'||process.env.PROFILE_TRACE!=='1')throw Error('Phase controller requires pending marks and GPU trace');
const base = 'http://127.0.0.1:9338'
const salt = `qa_guard_${Date.now()}`
if(!process.env.PROFILE_URL)throw Error('Explicit current candidate owned URL required');
const url = process.env.PROFILE_URL+`/create?qa=${salt}`
const out = process.env.PROFILE_OUT || 'temp/profile/samsung-contact-budget.json'
const cases = [
  {name:'loaded400',size:400,preset:'normal:100:100:PB29:round',pts:[[.2,.25],[.7,.25],[.2,.31],[.7,.31]],ms:6000},
  {name:'truewater400',size:400,preset:'normal:100:0:PB29:round',pts:[[.2,.6],[.7,.6],[.2,.66],[.7,.66]],ms:6000},
];
const report = {source:'current577 phase; external exact passport required; no queue tuning',salt,url,errors:[],cpuSampled:process.env.PROFILE_CPU==='1'}
let target, ws, seq = 0, traceResolve=null, tracePromise=null, pendingTraces=[], pendingFinalPng=null
const pending = new Map()
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2))
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout ${method}`)) }, 15000)
  pending.set(id, { resolve, reject, timer })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const wait = async expression => {
  for (let i = 0; i < 480; i++) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw Error(`Condition timeout: ${expression}`)
}
const wall = setTimeout(() => {
  report.wallTimeout = true
  if (target) void fetch(`${base}/json/close/${target.id}`)
}, Number(process.env.PROFILE_WALL_MS || 600000))
try {
  execFileSync('/home/suselman/.local/bin/home-devices', ['adb', 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-p', 'com.android.chrome'], { timeout: 15000 })
  for (let i = 0; i < 40 && !target; i++) {
    const pages = await (await fetch(`${base}/json/list`)).json()
    target = pages.find(page => page.url === url)
    if (!target) await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!target) throw Error('Owned exact URL target unavailable')
  report.targetId = target.id
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  ws.on('message', data => {
    const result = JSON.parse(data)
    if (result.id && pending.has(result.id)) {
      const call = pending.get(result.id)
      clearTimeout(call.timer); pending.delete(result.id)
      result.error ? call.reject(Error(result.error.message)) : call.resolve(result.result)
    } else if(result.method==='Tracing.tracingComplete'){traceResolve?.(result.params)} else if (result.method === 'Runtime.exceptionThrown') report.errors.push(result.params.exceptionDetails.text)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  if(process.env.PROFILE_COLD==='1')await evaluate(`(()=>{if(window.__engine)throw Error('Cold compile hook arrived after engine');const proto=WebGLRenderingContext.prototype,old=proto.shaderSource;window.__coldShaders=[];const oldDelete=proto.deleteShader;proto.deleteShader=function(shader){const record=__coldShaders.find(x=>x.shader===shader);if(record){record.compiled=this.getShaderParameter(shader,this.COMPILE_STATUS);record.info=this.getShaderInfoLog(shader);record.deleted=true}return oldDelete.call(this,shader)};proto.shaderSource=function(shader,source){__coldShaders.push({gl:this,shader,chars:source.length});return old.call(this,shader,source+'\\n// owned cold compile '+${JSON.stringify(salt)})};return true})()`)
  await wait('!!window.__engine || !!document.querySelector("form input[type=text]")')
  if (await evaluate('!!document.querySelector("form input[type=text]")')) {
    await evaluate(`(() => {const input=document.querySelector('form input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Samsung final watercolor QA');input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
    await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Fine');if(b)b.click()})()`);await evaluate('document.querySelector("form button[type=submit]").click()')
  }
  await wait('!!window.__engine')
  report.roomUrl = await evaluate('location.href')
  report.queueTickSourceHash=createHash('sha256').update(await evaluate('__engine._settleQueue.tick.toString()')).digest('hex');report.initialCap=await evaluate('__engine._settleQueue.contactBatchMax')
  await evaluate('__engine.paperReady()')
  await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size')
  report.passport = await evaluate(`(() => {const e=__engine,g=e.gl,x=g.getExtension('WEBGL_debug_renderer_info');return{renderer:x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),paperLoaded:e._paper.loaded,gl:g.getError(),lost:g.isContextLost(),timeOrigin:performance.timeOrigin,visibility:document.visibilityState,canvas:[e.canvas.width,e.canvas.height],page:e._pageSize(),dpr:devicePixelRatio,camera:e._camera.pose,ops:e.getOperations().length};})()`)
  if(report.passport.camera.angle!==0)throw Error('Camera angle must be zero');
  if(!report.passport.renderer.includes('Adreno')||report.passport.gl||report.passport.lost||report.passport.visibility!=='visible')throw Error('Passport failed')
  const library=fs.readFileSync('apps/web/scripts/devices/pageLib.js','utf8').replace('pressure: 0.8,','pressure: (window.__pressureJitter ? 0.55+0.25*Math.sin(ts*.012) : 0.8),').replace('const d = [], active = [], tail = []','const d = [], active = [], tail = []').replace('requestAnimationFrame(tail)\n    }','if(window.__omitTail)done();else requestAnimationFrame(tail)\n    }').replace('drawnOperations, n: d.length','drawnOperations, gestureT0:t0,penUpAt,activeFrames: active,tailFrames:tail,frameTimes:frames,n:d.length');
  await evaluate(library)
  await evaluate(`(()=>{const p=__engine._pointer,old=p._handleMove;window.__inputCosts=[];p._handleMove=function(...a){const t=performance.now();try{return old.apply(this,a)}finally{__inputCosts.push(performance.now()-t)}}})()`)
  await evaluate('__roomStore.getState().setTool("hand")')
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  report.blocked=await evaluate(`(async()=>{const before=__engine.getOperations().length;try{await __mt.stroke({pts:[[.4,.4],[.5,.4]],ms:100,perFrame:1});return{rejected:false,before,after:__engine.getOperations().length}}catch(error){return{rejected:true,error:String(error),before,after:__engine.getOperations().length}}})()`)
  if(!report.blocked.rejected||report.blocked.before!==report.blocked.after)throw Error('Blocked fixture must reject before reporting timing')
  await evaluate('__roomStore.getState().setTool("watercolor")')
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  report.drawGate=await evaluate('({locked:__engine._locked,active:__engine._activeId,known:__engine._layers.has(__engine._activeId),storeTool:__roomStore.getState().tool,pointerHandlers:Object.keys(__engine._pointer._handlers)})')
  if(report.drawGate.locked||!report.drawGate.known)throw Error('No drawable layer/tool; reject idle metrics')
  await evaluate('__mt.watch()')
  if(process.env.PROFILE_PENDING==='1')await evaluate(`(()=>{window.__pendingCalls=[];const e=__engine;for(const name of ['_onStart','_onMove','_onEnd','_finishRibbonStroke','_completeSettle','_paintStrokeDabs','_paintDabs','_display','_runSlice','_packWashBoundaries']){const old=e[name];if(typeof old!=='function')continue;e[name]=function(...a){const at=performance.now(),remaining=e._settle?e._settle.ops.length-e._settle.next:0;if(name==='_completeSettle'&&remaining>1000&&!window.__bigDrainStack)window.__bigDrainStack={at,remaining,stack:new Error('owned large drain caller').stack};if(window.__traceMarkers&&(name==='_completeSettle'||name==='_onStart'||name==='_onEnd'||name==='_finishRibbonStroke'||name==='_packWashBoundaries'))performance.mark('owned_'+name+'_start');try{return old.apply(this,a)}finally{const ms=performance.now()-at;if(window.__traceMarkers&&(name==='_completeSettle'||name==='_onStart'||name==='_onEnd'||name==='_finishRibbonStroke'||name==='_packWashBoundaries'))performance.mark('owned_'+name+'_end');if(ms>=1||name==='_onStart'||name==='_completeSettle')__pendingCalls.push({name,at,ms,remaining})}}}return true})()`)
  await evaluate(`(()=>{window.__progressProbe={sourceDefaults:true};window.__contactJobs=[];window.__contactBudgetTicks=[];const q=__engine._settleQueue;if(!q)throw Error('Current queue missing');window.__currentQueueFlags={contactBatchEnabled:q.contactBatchEnabled,contactBatchMax:q.contactBatchMax,frontBatchEnabled:q.frontBatchEnabled,contactBudgetMs:q.contactBudgetMs,contactRoiPingPong:q.contactRoiPingPong};window.__contactSyncedUnits=[];return true})()`)
  report.currentCandidateFlags=await evaluate(`(()=>{const e=__engine;if(${process.env.PROFILE_SOURCE_FILM?'true':'false'}){if(typeof e._wcSourceFilmRebase!=='boolean')throw Error('Source film candidate absent');e._wcSourceFilmRebase=${process.env.PROFILE_SOURCE_FILM==='1'}};return{sourceFilm:e._wcSourceFilmRebase,coverageFilm:e._wcCoverageFilmRebase,zeroPigmentContacts:e._wcZeroPigmentContacts}})()`)
  if(report.currentCandidateFlags.sourceFilm!==true||report.currentCandidateFlags.coverageFilm!==false||report.currentCandidateFlags.zeroPigmentContacts!==false)throw Error('Current577 flag passport mismatch');
  report.runs=[]
  await evaluate(`(()=>{const e=__engine,p=e._settlePlan.ctx.passes(),old=p.brushPass,ids=new WeakMap();let next=0,lastP=null,lastC=null;window.__roiCensus={brushCalls:0,pDestinationSwitches:0,cDestinationSwitches:0,copyRegionCalls:0};p.brushPass=function(...a){const dst=a[5];if(!ids.has(dst))ids.set(dst,++next);const id=ids.get(dst),isC=(__roiCensus.brushCalls++%2)===0;if(isC){if(lastC!==null&&lastC!==id)__roiCensus.cDestinationSwitches++;lastC=id}else{if(lastP!==null&&lastP!==id)__roiCensus.pDestinationSwitches++;lastP=id}return old.apply(this,a)};const gl=e.gl,copy=gl.copyTexSubImage2D;gl.copyTexSubImage2D=function(...a){__roiCensus.copyRegionCalls++;return copy.apply(this,a)};return true})()`)
  for(const scenario of cases) {
    const {size,preset,pts,ms}=scenario
    await evaluate(`window.__omitTail=true;window.__pressureJitter=false;window.__bigDrainStack=null;__pendingCalls.length=0;__inputCosts.length=0`)
    await evaluate(`__mt.setup({preset:${JSON.stringify(preset)},color:[0.3,0.15,0.55],size:${size}})`)
    let profileWindow=null;
    if(process.env.PROFILE_CPU==='1'){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:2000});profileWindow={beforeStart:await evaluate('performance.now()')};await send('Profiler.start');profileWindow.afterStart=await evaluate('performance.now()')}
    const countBefore=await evaluate('__engine.getOperations().filter(o=>o.type==="stroke").length')
    if(process.env.PROFILE_TRACE==='1'){tracePromise=new Promise(resolve=>{traceResolve=resolve});await send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'gzip',traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:4096,enableSampling:false,enableSystrace:false,enableArgumentFilter:true,includedCategories:['gpu','blink.user_timing']}});await evaluate('window.__traceMarkers=true;performance.mark("owned_before_backlog_probe")')}
    const metrics=JSON.parse(await evaluate(`__mt.stroke({pts:${JSON.stringify(pts)},ms:${ms},perFrame:2})`))
    let backlogProbe=null;
    if(scenario.name==='dense80'){
      const beforeProbe=await evaluate('({settle:!!__engine._settle,pending:__engine._opQueue.length,inputs:__inputCosts.length})');
      if(beforeProbe.settle||beforeProbe.pending){
        if(process.env.PROFILE_TRACE==='1'){tracePromise=new Promise(resolve=>{traceResolve=resolve});await send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'gzip',traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:4096,enableSampling:false,enableSystrace:false,enableArgumentFilter:true,includedCategories:['gpu','toplevel','cc','viz','blink.user_timing']}});await evaluate('window.__traceMarkers=true;performance.mark("owned_before_backlog_probe")')}
        const probeMetrics=JSON.parse(await evaluate(`__mt.stroke({pts:[[.2,.85],[.42,.85]],ms:700,perFrame:2})`));backlogProbe={before:beforeProbe,metrics:probeMetrics};}
      else backlogProbe={before:beforeProbe,notMeasured:true,reason:'No backlog remained; do not infer queued input latency'};
    }
    await wait('__engine._log.entries.filter(x=>x.op.type==="stroke"&&!x.pending&&x.serverSeq!=null).length>'+ (countBefore+(backlogProbe?.metrics?1:0)))
    const penup=Date.now();await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size')
    if(process.env.PROFILE_CPU==='1'){profileWindow.beforeStop=await evaluate('performance.now()');const {profile}=await send('Profiler.stop');profileWindow.afterStop=await evaluate('performance.now()');profileWindow.profileStartUs=profile.startTime;profileWindow.profileEndUs=profile.endTime;fs.writeFileSync(out.replace('.json','-'+scenario.name+'.cpuprofile'),JSON.stringify(profile));await send('Profiler.disable')}
    if(tracePromise){await evaluate('performance.mark("owned_after_backlog_probe");window.__traceMarkers=false');await send('Tracing.end');const complete=await Promise.race([tracePromise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Trace completion timeout')),10000))]);if(!complete.stream)throw Error('Trace stream absent');const traceName=out.split('/').at(-1).replace('.json','-'+scenario.name+'-gpu-trace.json.gz');if(!/^[a-zA-Z0-9._-]+$/.test(traceName))throw Error('Unsafe trace basename');const chunks=[];let bytes=0,eof=false;for(let i=0;i<256&&!eof;i++){const part=await send('IO.read',{handle:complete.stream,size:65536});const data=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');bytes+=data.length;if(bytes>8388608)throw Error('Trace compressed size bound');chunks.push(data);eof=part.eof}await send('IO.close',{handle:complete.stream});if(!eof)throw Error('Trace chunk bound');if(pendingTraces.reduce((n,x)=>n+x.data.length,0)+bytes>8388608)throw Error('Aggregate compressed trace bound');pendingTraces.push({name:traceName,data:Buffer.concat(chunks)});(report.gpuTraces??=[]).push({homePath:traceName,bytes,bufferKb:4096});tracePromise=null}
    const state=await evaluate(`(()=>{const e=__engine;return{contactJobs:__contactJobs.splice(0),syncedUnits:window.__contactSyncedUnits?.splice(0)??null,bigDrainStack:window.__bigDrainStack??null,pendingCalls:window.__pendingCalls??null,inputHandlerCosts:__inputCosts,camera:e._camera.pose,perf:e.getWatercolorPerf(),gl:e.gl.getError(),lost:e.gl.isContextLost(),settle:!!e._settle,queue:e._opQueue.length,strokeCount:e.getOperations().filter(o=>o.type==='stroke').length,stalls:JSON.parse(__mt.stalls()),budgetTicks:__contactBudgetTicks.splice(0)}})()`)
    report.runs.push({scenario,size,metrics,backlogProbe,profileWindow,postTailSolverWaitMs:Date.now()-penup,state});save()
    if(state.gl||state.lost)throw Error('Native GL failure')
  }
  report.coldCompile=await evaluate(`(()=>{if(!window.__coldShaders)return null;return __coldShaders.map(x=>({chars:x.chars,compiled:x.deleted?x.compiled:x.gl.getShaderParameter(x.shader,x.gl.COMPILE_STATUS),lost:x.gl.isContextLost(),info:x.deleted?x.info:x.gl.getShaderInfoLog(x.shader),deleted:!!x.deleted}))})()`);
  if(report.coldCompile?.some(x=>!x.compiled||x.lost))throw Error('Cold shader compile failed');
  if(process.env.PROFILE_FINAL_CANON==='1'){
    report.finalMorph=await evaluate(`(async()=>{const e=__engine,t=performance.now();while(performance.now()-t<20000){if(!e._settle&&!e._opQueue.length&&!e._washReveals.size&&!e._rebuildJobs.size&&!e._pendingRebuilds.size)return{idle:true,waitMs:performance.now()-t,gl:e.gl.getError(),lost:e.gl.isContextLost(),reveals:0,operations:e.getOperations()};await new Promise(r=>setTimeout(r,50))}throw Error('Native final morph idle guard')})()`);
    const encoded=await evaluate(`(async()=>{const blob=await __engine.exportPNG();if(!blob)throw Error('Native final PNG empty');return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob)})})()`);
    pendingFinalPng=Buffer.from(encoded,'base64');
  }
  report.actualQueueFlags=await evaluate('window.__currentQueueFlags');
  report.progressProbe=await evaluate('({...__progressProbe,suppress:__engine._settleQueue.suppressDrainPreview})');
  report.roiCensus=await evaluate('window.__roiCensus');
  report.pass=report.runs.length===cases.length&&!report.errors.length

} catch (error) { report.error = String(error); process.exitCode = 1 }
finally {
  clearTimeout(wall)
  if(tracePromise&&ws?.readyState===WebSocket.OPEN)await send('Tracing.end').catch(()=>{});
  if (target) {
    try { await fetch(`${base}/json/close/${target.id}`,{signal:AbortSignal.timeout(5000)}); report.ownTargetClosed = true }
    catch(error){report.closeError=String(error);process.exitCode=1}
  }
  if (ws) ws.close()
  try{save()}catch(error){console.error('Report persistence failed after target cleanup: '+String(error));process.exitCode=1}
}
if(pendingFinalPng){
 const name=out.split('/').at(-1).replace('.json','-final.png');if(!/^[a-zA-Z0-9._-]+$/.test(name))throw Error('Unsafe final PNG name');
 execFileSync('ssh',['-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p','22022','suselman@127.0.0.1','cat > /home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/contact-budget/samsung/'+name],{input:pendingFinalPng,timeout:60000,maxBuffer:1024});
 report.finalPngHome=name;save();
}
for(const pendingTrace of pendingTraces){
 execFileSync('ssh',['-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p','22022','suselman@127.0.0.1','cat > /home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/contact-budget/samsung/'+pendingTrace.name],{input:pendingTrace.data,timeout:60000,maxBuffer:1024});
 report.traceTransferredAfterCleanup=true;save();
}
console.log(JSON.stringify({pass:report.pass,targetId:report.targetId,closed:report.ownTargetClosed,error:report.error,runs:report.runs?.map(x=>({name:x.scenario.name,activeMax:x.metrics.activeMax,tailMax:x.metrics.tailMax,gl:x.state.gl}))}))
