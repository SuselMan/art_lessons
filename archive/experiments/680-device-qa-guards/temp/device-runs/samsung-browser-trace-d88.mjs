import WebSocket from 'ws'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:9338'
const salt = `qa_browser_trace_${Date.now()}`
const url = `https://192.168.1.70:5329/create?qa=${salt}`
const out = 'temp/device-runs/browser-trace-d88/report.json'
const report = { source: 'b8633207 combined PR725 source; own5329/backend4537', salt, url, errors: [] }
let target, ws, seq = 0, tracing = false, traceDoneResolve
const traceDone = new Promise(resolve => { traceDoneResolve = resolve })
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
  for (let i = 0; i < 140; i++) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw Error(`Condition timeout: ${expression}`)
}
const wall = setTimeout(() => {
  report.wallTimeout = true
  if (target) void fetch(`${base}/json/close/${target.id}`)
}, 180000)
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
    } else if (result.method === 'Tracing.tracingComplete') traceDoneResolve(result.params)
    else if (result.method === 'Runtime.exceptionThrown') report.errors.push(result.params.exceptionDetails.text)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await wait('!!window.__engine || !!document.querySelector("form input[type=text]")')
  if (await evaluate('!!document.querySelector("form input[type=text]")')) {
    await evaluate(`(() => {const input=document.querySelector('form input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Samsung final watercolor QA');input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
    await evaluate('document.querySelector("form button[type=submit]").click()')
  }
  await wait('!!window.__engine')
  report.roomUrl = await evaluate('location.href')
  await evaluate('__engine.paperReady()')
  await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size')
  report.passport = await evaluate(`(() => {const e=__engine,g=e.gl,x=g.getExtension('WEBGL_debug_renderer_info');return{renderer:x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),paperLoaded:e._paper.loaded,gl:g.getError(),lost:g.isContextLost(),visibility:document.visibilityState,canvas:[e.canvas.width,e.canvas.height],dpr:devicePixelRatio,camera:e._camera.pose,ops:e.getOperations().length};})()`)
  if(!report.passport.renderer.includes('Adreno')||report.passport.gl||report.passport.lost||report.passport.visibility!=='visible')throw Error('Passport failed')
  await evaluate(fs.readFileSync('apps/web/scripts/devices/pageLib.js','utf8'))
  await evaluate('__roomStore.getState().setTool("hand")')
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  report.blocked=await evaluate(`(async()=>{const before=__engine.getOperations().length;try{await __mt.stroke({pts:[[.4,.4],[.5,.4]],ms:100,perFrame:1});return{rejected:false,before,after:__engine.getOperations().length}}catch(error){return{rejected:true,error:String(error),before,after:__engine.getOperations().length}}})()`)
  if(!report.blocked.rejected||report.blocked.before!==report.blocked.after)throw Error('Blocked fixture must reject before reporting timing')
  await evaluate('__roomStore.getState().setTool("watercolor")')
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  report.drawGate=await evaluate('({locked:__engine._locked,active:__engine._activeId,known:__engine._layers.has(__engine._activeId),storeTool:__roomStore.getState().tool,pointerHandlers:Object.keys(__engine._pointer._handlers)})')
  if(report.drawGate.locked||!report.drawGate.known)throw Error('No drawable layer/tool; reject idle metrics')
  await evaluate('__mt.watch()')
  await send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,v8,cc,gpu,toplevel,blink.user_timing',transferMode:'ReturnAsStream',streamFormat:'json',options:'record-until-full',bufferUsageReportingInterval:1000});tracing=true;
  await evaluate("performance.mark('qa-trace-start');__mt.setup({preset:'normal:100:0:PB29:round',color:[0.2,0.3,0.6],size:400})");
  report.metrics=JSON.parse(await evaluate("__mt.stroke({pts:[[.35,.45],[.5,.45],[.65,.45]],ms:3000,perFrame:2})"));
  await evaluate("performance.mark('qa-pen-end')");save();
  await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size');
  await evaluate("new Promise(r=>setTimeout(r,2000))");
  report.after=await evaluate(`(()=>{const e=__engine;performance.mark('qa-tail-end');return {gl:e.gl.getError(),lost:e.gl.isContextLost(),visibility:document.visibilityState,timeOrigin:performance.timeOrigin,pending:e._log.entries.filter(x=>x.pending).length,strokes:e._log.entries.filter(x=>x.op.type==='stroke').map(x=>({id:x.op.id,strokeId:x.op.strokeId,pending:x.pending,serverSeq:x.serverSeq})),perf:e.getWatercolorPerf(),stalls:JSON.parse(__mt.stalls())}})()`);
  await send('Tracing.end');tracing=false;
  const done=await Promise.race([traceDone,new Promise((_,reject)=>setTimeout(()=>reject(Error('traceComplete timeout')),15000))]);
  if(!done.stream)throw Error('No trace stream');
  const fd=fs.openSync('temp/device-runs/browser-trace-d88/trace.json','w');let bytes=0;
  try{for(;;){const x=await send('IO.read',{handle:done.stream,size:262144});const b=Buffer.from(x.data,x.base64Encoded?'base64':'utf8');bytes+=b.length;if(bytes>64*1024*1024)throw Error('Trace exceeds64MiB cap');fs.writeSync(fd,b);if(x.eof)break}}finally{fs.closeSync(fd);await send('IO.close',{handle:done.stream})}
  report.traceBytes=bytes;report.pass=!report.after.gl&&!report.after.lost&&!report.after.pending&&report.after.strokes.length>0;
} catch(error){report.error=String(error);process.exitCode=1}
finally{clearTimeout(wall);if(tracing){try{await send('Tracing.end')}catch{}}save();if(ws)ws.close();if(target){await fetch(`${base}/json/close/${target.id}`);report.ownTargetClosed=true;save()}}
console.log(JSON.stringify({pass:report.pass,error:report.error,traceBytes:report.traceBytes,ownTargetClosed:report.ownTargetClosed,targetId:report.targetId}));
