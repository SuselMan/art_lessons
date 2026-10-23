import { createRequire } from 'node:module'
const require = createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json')
const WebSocket = require('ws')
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:9338'
const salt = `qa_guard_${Date.now()}`
const url = `https://192.168.1.70:5311/create?qa=${salt}`
const out = process.env.PROFILE_OUT || 'temp/profile/samsung-replay-cap.json'
const cases = process.env.PROFILE_PENDING === '1' && process.env.PROFILE_PRIMED !== '1' ? [{name:'dense80',size:80,preset:'normal:100:100:PB29:round',pts:Array.from({length:9},(_,i)=>[i%2?.7:.5,.3+i*.045]),ms:6000}] : process.env.PROFILE_EXTENDED === '1' ? [
  {name:'pigment80',size:80,preset:'normal:100:100:PB29:round',pts:[[.2,.25],[.42,.25]],ms:700},
  {name:'pigment400',size:400,preset:'normal:100:100:PB29:round',pts:[[.2,.3],[.7,.3],[.2,.36],[.7,.36]],ms:6000},
  {name:'water400',size:400,preset:'normal:0:100:PB29:round',pts:[[.2,.5],[.7,.5],[.2,.56],[.7,.56]],ms:6000},
  {name:'dense80',size:80,preset:'normal:100:100:PB29:round',pts:Array.from({length:9},(_,i)=>[i%2?.7:.5,.62+i*.025]),ms:6000},
] : [80,400].map(size=>({name:'pigment'+size,size,preset:'normal:100:100:PB29:round',pts:[[.4,.43],[.52,.43]],ms:700}))
const report = {batchEnabled:process.env.PROFILE_BATCH!=='0',cpuSampled:process.env.PROFILE_CPU==='1', source: 'fa084ed1 standalone brush early-zero, frozen5311 engine03f24b05', salt, url, errors: [] }
let target, ws, seq = 0, traceResolve=null, tracePromise=null, pendingPng=null
const pending = new Map()
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2))
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout ${method}`)) }, method==='Runtime.evaluate' && params.awaitPromise ? 120000 : 15000)
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
  await evaluate('__engine.paperReady()')
  await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size')
  report.passport = await evaluate(`(() => {const e=__engine,g=e.gl,x=g.getExtension('WEBGL_debug_renderer_info');return{renderer:x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),paperLoaded:e._paper.loaded,gl:g.getError(),lost:g.isContextLost(),timeOrigin:performance.timeOrigin,visibility:document.visibilityState,canvas:[e.canvas.width,e.canvas.height],page:e._pageSize(),dpr:devicePixelRatio,camera:e._camera.pose,ops:e.getOperations().length};})()`)
  if(report.passport.camera.angle!==0)throw Error('Camera angle must be zero');
  if(!report.passport.renderer.includes('Adreno')||report.passport.gl||report.passport.lost||report.passport.visibility!=='visible')throw Error('Passport failed')
  const library=fs.readFileSync('apps/web/scripts/devices/pageLib.js','utf8').replace('pressure: 0.8,','pressure: (window.__pressureJitter ? 0.55+0.25*Math.sin(ts*.012) : 0.8),').replace('const d = [], active = [], tail = []','const d = [], active = [], tail = []').replace('drawnOperations, n: d.length','drawnOperations, gestureT0:t0,penUpAt,activeFrames: active,tailFrames:tail,frameTimes:frames,n:d.length');
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
  report.shaderBench=await evaluate(fs.readFileSync('temp/profile/brush-zero-bench.js','utf8'));
  if(report.shaderBench.rows.length!==15||report.shaderBench.gl||report.shaderBench.lost||report.shaderBench.rows.some(r=>r.gl||r.lost||Object.values(r.differences).some(d=>d.pixels||d.max)||r.outputs.some(o=>!o.nonzero.P||!o.nonzero.C)))throw Error('Brush zero exact nonempty GPU gate');
  if(report.shaderBench.rows.some(r=>['zero-dose','dry-water'].includes(r.kind)&&r.outputs.some(o=>o.changed.P||o.changed.C)))throw Error('Brush zero negative identity guard');
  if(report.shaderBench.rows.filter(r=>['wet-ellipse','capacity'].includes(r.kind)).some(r=>r.outputs.some(o=>!o.changed.P&&!o.changed.C)))throw Error('Brush nonzero transport no-op guard');
  report.pass=true;
  report.coldCompile=await evaluate(`(()=>{if(!window.__coldShaders)return null;return __coldShaders.map(x=>({chars:x.chars,compiled:x.deleted?x.compiled:x.gl.getShaderParameter(x.shader,x.gl.COMPILE_STATUS),lost:x.gl.isContextLost(),info:x.deleted?x.info:x.gl.getShaderInfoLog(x.shader),deleted:!!x.deleted}))})()`);
  if(report.coldCompile?.some(x=>!x.compiled||x.lost))throw Error('Cold shader compile failed');
  report.pass=report.pass&&!report.errors.length

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
if(pendingPng){
 const name=out.split('/').at(-1).replace('.json','.png');if(!/^[a-zA-Z0-9._-]+$/.test(name))throw Error('Unsafe output basename');
 console.log('OWN_TARGET_CLOSED '+report.targetId);
 execFileSync('ssh',['-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p','22022','suselman@127.0.0.1','cat > /home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/contact-budget/samsung/'+name],{input:pendingPng,timeout:60000,maxBuffer:1024});
 report.pngHome=name;save();
}

console.log(JSON.stringify({pass:report.pass,targetId:report.targetId,closed:report.ownTargetClosed,error:report.error,replay:report.replay?{cap:report.replay.cap,solverMs:report.replay.solverMs,totalMs:report.replay.totalMs,gl:report.replay.gl}:null}))
