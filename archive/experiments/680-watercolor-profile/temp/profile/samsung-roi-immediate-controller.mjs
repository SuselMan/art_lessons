import { createRequire } from 'node:module'
const require = createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json')
const WebSocket = require('ws')
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:9338'
const salt = `qa_guard_${Date.now()}`
const url = `https://192.168.1.70:5311/create?qa=${salt}`
const out = process.env.PROFILE_OUT || 'temp/profile/samsung-contact-budget.json'
const cases = process.env.PROFILE_PENDING === '1' && process.env.PROFILE_PRIMED !== '1' ? [{name:'dense80',size:80,preset:'normal:100:100:PB29:round',pts:Array.from({length:9},(_,i)=>[i%2?.7:.5,.3+i*.045]),ms:6000}] : process.env.PROFILE_EXTENDED === '1' ? [
  {name:'pigment80',size:80,preset:'normal:100:100:PB29:round',pts:[[.2,.25],[.42,.25]],ms:700},
  {name:'pigment400',size:400,preset:'normal:100:100:PB29:round',pts:[[.2,.3],[.7,.3],[.2,.36],[.7,.36]],ms:6000},
  {name:'water400',size:400,preset:'normal:100:0:PB29:round',pts:[[.2,.5],[.7,.5],[.2,.56],[.7,.56]],ms:6000},
  {name:'dense80',size:80,preset:'normal:100:100:PB29:round',pts:Array.from({length:9},(_,i)=>[i%2?.7:.5,.62+i*.025]),ms:6000},
] : [80,400].map(size=>({name:'pigment'+size,size,preset:'normal:100:100:PB29:round',pts:[[.4,.43],[.52,.43]],ms:700}))
for(const c of cases)if(c.name==='water400'&&c.preset!=='normal:100:0:PB29:round')throw Error('Pure water preset passport mismatch');
const report = {roiEnabled:process.env.PROFILE_ROI==='1',configuredCap:Number(process.env.PROFILE_CAP||4),configuredBudgetMs:Number(process.env.PROFILE_BUDGET_MS||4),batchEnabled:process.env.PROFILE_BATCH!=='0',cpuSampled:process.env.PROFILE_CPU==='1', source: '1b2368a4 ROI diagnostic own5311/backend4537; transfer passport required', salt, url, errors: [] }
let target, ws, seq = 0, traceResolve=null, tracePromise=null, pendingTrace=null, pendingFinalPng=null
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
  report.queueTickSourceHash=createHash('sha256').update(await evaluate('__engine._settleQueue.tick.toString()')).digest('hex');report.initialCap=await evaluate('__engine._settleQueue.contactBatchMax');if(report.initialCap!==4)throw Error('Default cap passport mismatch')
  await evaluate('__engine.paperReady()')
  await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size')
  report.passport = await evaluate(`(() => {const e=__engine,g=e.gl,x=g.getExtension('WEBGL_debug_renderer_info');return{renderer:x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),paperLoaded:e._paper.loaded,gl:g.getError(),lost:g.isContextLost(),timeOrigin:performance.timeOrigin,visibility:document.visibilityState,canvas:[e.canvas.width,e.canvas.height],page:e._pageSize(),dpr:devicePixelRatio,camera:e._camera.pose,ops:e.getOperations().length};})()`)
  if(report.passport.camera.angle!==0)throw Error('Camera angle must be zero');
  if(!report.passport.renderer.includes('Adreno')||report.passport.gl||report.passport.lost||report.passport.visibility!=='visible')throw Error('Passport failed')
  const library=fs.readFileSync('apps/web/scripts/devices/pageLib.js','utf8').replace('pressure: 0.8,','pressure: (window.__pressureJitter ? 0.55+0.25*Math.sin(ts*.012) : 0.8),').replace('const d = [], active = [], tail = []','const d = [], active = [], tail = []').replace('requestAnimationFrame(tail)\n    }', 'if(window.__omitTail)done();else requestAnimationFrame(tail)\n    }').replace('drawnOperations, n: d.length','drawnOperations, gestureT0:t0,penUpAt,activeFrames: active,tailFrames:tail,frameTimes:frames,n:d.length');
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
  if(process.env.PROFILE_PENDING==='1')await evaluate(`(()=>{window.__pendingCalls=[];const e=__engine;for(const name of ['_onStart','_onMove','_onEnd','_completeSettle','_paintStrokeDabs','_paintDabs','_display','_runSlice','_packWashBoundaries']){const old=e[name];if(typeof old!=='function')continue;e[name]=function(...a){const at=performance.now(),remaining=e._settle?e._settle.ops.length-e._settle.next:0;if(name==='_completeSettle'&&remaining>1000&&!window.__bigDrainStack)window.__bigDrainStack={at,remaining,stack:new Error('owned large drain caller').stack};if(window.__traceMarkers&&(name==='_completeSettle'||name==='_onStart'||name==='_packWashBoundaries'))performance.mark('owned_'+name+'_start');try{return old.apply(this,a)}finally{const ms=performance.now()-at;if(window.__traceMarkers&&(name==='_completeSettle'||name==='_onStart'||name==='_packWashBoundaries'))performance.mark('owned_'+name+'_end');if(ms>=1||name==='_onStart'||name==='_completeSettle')__pendingCalls.push({name,at,ms,remaining})}}}return true})()`)
  await evaluate(`(()=>{const e=__engine,q=e._settleQueue;if(typeof q.suppressDrainPreview!=='boolean')throw Error('Drain preview source absent');q.suppressDrainPreview=${process.env.PROFILE_SUPPRESS==='1'};window.__progressProbe={attempts:0,suppressedAttempts:0,drainCallbacks:0,asyncCallbacks:0};const ctx=e._settlePlan.ctx,gate=ctx.shouldPreview;ctx.shouldPreview=function(){const allow=gate.call(this);__progressProbe.attempts++;if(!allow)__progressProbe.suppressedAttempts++;return allow};const prepare=e._diffuseWashOps;e._diffuseWashOps=function(...args){const p=args[10];if(p)args[10]=function(...a){if(q._drainDepth>0)__progressProbe.drainCallbacks++;else __progressProbe.asyncCallbacks++;return p(...a)};return prepare.apply(this,args)}})()`)
  report.runs=[]
  await evaluate(`(()=>{const e=__engine,p=e._settlePlan.ctx.passes(),old=p.brushPass,ids=new WeakMap();let next=0,lastP=null,lastC=null;window.__roiCensus={brushCalls:0,pDestinationSwitches:0,cDestinationSwitches:0,copyRegionCalls:0};p.brushPass=function(...a){const dst=a[5];if(!ids.has(dst))ids.set(dst,++next);const id=ids.get(dst),isC=(__roiCensus.brushCalls++%2)===0;if(isC){if(lastC!==null&&lastC!==id)__roiCensus.cDestinationSwitches++;lastC=id}else{if(lastP!==null&&lastP!==id)__roiCensus.pDestinationSwitches++;lastP=id}return old.apply(this,a)};const gl=e.gl,copy=gl.copyTexSubImage2D;gl.copyTexSubImage2D=function(...a){__roiCensus.copyRegionCalls++;return copy.apply(this,a)};return true})()`)
  await evaluate(`(()=>{const q=__engine._settleQueue;if(typeof q.contactBatchEnabled!=='boolean')throw Error('Candidate source missing');if(typeof q.contactRoiPingPong!=='boolean'||q.contactRoiPingPong!==false)throw Error('ROI source absent or default enabled');q.contactRoiPingPong=${process.env.PROFILE_ROI==='1'};q.contactBatchEnabled=${process.env.PROFILE_BATCH!=='0'};q.contactBatchMax=${Number(process.env.PROFILE_CAP||4)};q.frontBatchEnabled=${process.env.PROFILE_FRONT==='1'};if(${process.env.PROFILE_BUDGET_MS?'true':'false'}){if(typeof q.contactBudgetMs!=='number')throw Error('Diagnostic budget source missing');q.contactBudgetMs=${Number(process.env.PROFILE_BUDGET_MS||4)}};window.__contactBudgetTicks=[];window.__contactJobs=[];const tick=q.tick,advance=q.advance,start=q.start;let count=0; q.start=function(scratch,ops,complete,...rest){const job={at:performance.now(),total:ops.length,end:null};__contactJobs.push(job);return start.call(this,scratch,ops,function(...a){job.end=performance.now();return complete.apply(this,a)},...rest)};let unitAt=0;const syncGpu=q.ctx.syncGpu;if(${process.env.PROFILE_UNITS==='1'}){window.__contactSyncedUnits=[];q.ctx.syncGpu=function(...a){try{return syncGpu.apply(this,a)}finally{__contactSyncedUnits.push({at:unitAt,ms:performance.now()-unitAt})}}};q.advance=function(...a){count++;unitAt=performance.now();return advance.apply(this,a)};q.tick=function(...a){const at=performance.now(),before=count,drawing=q.ctx.isDrawing();try{return tick.apply(this,a)}finally{__contactBudgetTicks.push({at,ms:performance.now()-at,advances:count-before,drawing})}}})()`)
  for(const scenario of cases) {
    const {size,preset,pts,ms}=scenario
    await evaluate(`window.__pressureJitter=${scenario.name==='dense80'};__inputCosts.length=0`)
    await evaluate(`__mt.setup({preset:${JSON.stringify(preset)},color:[0.3,0.15,0.55],size:${size}})`)
    let profileWindow=null;
    if(process.env.PROFILE_CPU==='1'){await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:2000});profileWindow={beforeStart:await evaluate('performance.now()')};await send('Profiler.start');profileWindow.afterStart=await evaluate('performance.now()')}
    const countBefore=await evaluate('__engine.getOperations().filter(o=>o.type==="stroke").length')
    if(scenario.name!=='dense80')throw Error('Immediate fixture requires dense scenario');
    if(process.env.PROFILE_TRACE==='1'){tracePromise=new Promise(resolve=>{traceResolve=resolve});await send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'gzip',traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:4096,enableSampling:false,enableSystrace:false,enableArgumentFilter:true,includedCategories:['gpu','blink.user_timing']}});await evaluate('window.__traceMarkers=true;performance.mark("owned_before_backlog_probe")')}
    const paired=await evaluate(`(async()=>{window.__omitTail=true;const primary=JSON.parse(await __mt.stroke({pts:${JSON.stringify(pts)},ms:${ms},perFrame:2}));const e=__engine,before={settle:!!e._settle,pending:e._opQueue.length,remaining:e._settle?e._settle.ops.length-e._settle.next:0,at:performance.now()};window.__omitTail=false;const next=JSON.parse(await __mt.stroke({pts:[[.2,.85],[.42,.85]],ms:700,perFrame:2}));return{primary,before,next}})()`);
    const metrics=paired.primary;
    let backlogProbe={before:paired.before,metrics:paired.next,immediateWithinSameEvaluation:true};
    if(false){
      const beforeProbe=await evaluate('({settle:!!__engine._settle,pending:__engine._opQueue.length,inputs:__inputCosts.length})');
      if(beforeProbe.settle||beforeProbe.pending){
        if(process.env.PROFILE_TRACE==='1'){tracePromise=new Promise(resolve=>{traceResolve=resolve});await send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'gzip',traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:4096,enableSampling:false,enableSystrace:false,enableArgumentFilter:true,includedCategories:['gpu','blink.user_timing']}});await evaluate('window.__traceMarkers=true;performance.mark("owned_before_backlog_probe")')}
        const probeMetrics=JSON.parse(await evaluate(`__mt.stroke({pts:[[.2,.85],[.42,.85]],ms:700,perFrame:2})`));backlogProbe={before:beforeProbe,metrics:probeMetrics};}
      else backlogProbe={before:beforeProbe,notMeasured:true,reason:'No backlog remained; do not infer queued input latency'};
    }
    await wait('__engine._log.entries.filter(x=>x.op.type==="stroke"&&!x.pending&&x.serverSeq!=null).length>'+ (countBefore+(backlogProbe?.metrics?1:0)))
    const penup=Date.now();await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size')
    if(process.env.PROFILE_CPU==='1'){profileWindow.beforeStop=await evaluate('performance.now()');const {profile}=await send('Profiler.stop');profileWindow.afterStop=await evaluate('performance.now()');profileWindow.profileStartUs=profile.startTime;profileWindow.profileEndUs=profile.endTime;fs.writeFileSync(out.replace('.json','-'+scenario.name+'.cpuprofile'),JSON.stringify(profile));await send('Profiler.disable')}
    if(tracePromise){await evaluate('performance.mark("owned_after_backlog_probe");window.__traceMarkers=false');await send('Tracing.end');const complete=await Promise.race([tracePromise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Trace completion timeout')),10000))]);if(!complete.stream)throw Error('Trace stream absent');const traceName=out.split('/').at(-1).replace('.json','-gpu-trace.json.gz');if(!/^[a-zA-Z0-9._-]+$/.test(traceName))throw Error('Unsafe trace basename');const chunks=[];let bytes=0,eof=false;for(let i=0;i<256&&!eof;i++){const part=await send('IO.read',{handle:complete.stream,size:65536});const data=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');bytes+=data.length;if(bytes>8388608)throw Error('Trace compressed size bound');chunks.push(data);eof=part.eof}await send('IO.close',{handle:complete.stream});if(!eof)throw Error('Trace chunk bound');pendingTrace={name:traceName,data:Buffer.concat(chunks)};report.gpuTrace={homePath:traceName,bytes,bufferKb:4096};tracePromise=null}
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
if(pendingTrace){
 execFileSync('ssh',['-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p','22022','suselman@127.0.0.1','cat > /home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/contact-budget/samsung/'+pendingTrace.name],{input:pendingTrace.data,timeout:60000,maxBuffer:1024});
 report.traceTransferredAfterCleanup=true;save();
}
console.log(JSON.stringify({pass:report.pass,targetId:report.targetId,closed:report.ownTargetClosed,error:report.error,runs:report.runs?.map(x=>({name:x.scenario.name,activeMax:x.metrics.activeMax,tailMax:x.metrics.tailMax,gl:x.state.gl}))}))
