import WebSocket from 'ws'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:9238'
const salt = `qa_guard_${Date.now()}`
const url = `https://192.168.1.70:5314/create?qa=${salt}`
const out = 'temp/device-runs/samsung-precision-sizes-native-pixels.json'
const report = { source: 'b8d75596 codec precision source; own5314/backend4537', salt, url, errors: [] }
let target, ws, seq = 0
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
}, 120000)
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
    } else if (result.method === 'Runtime.exceptionThrown') report.errors.push(result.params.exceptionDetails.text)
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
  report.runs=[]
  for(const size of [80,160,240]) {
    await evaluate(`__mt.setup({preset:'normal:100:100:PB29:round',color:[0.3,0.15,0.55],size:${size}})`)
    const countBefore=await evaluate('__engine.getOperations().filter(o=>o.type==="stroke").length')
    const metrics=JSON.parse(await evaluate(`__mt.stroke({pts:[[0.40,0.40],[0.48,0.43],[0.56,0.40]],ms:1000,perFrame:2})`))
    await wait('__engine._log.entries.filter(x=>x.op.type==="stroke"&&!x.pending&&x.serverSeq!=null).length>'+countBefore)
    const state=await evaluate(`(()=>{const e=__engine;return{perf:e.getWatercolorPerf(),gl:e.gl.getError(),lost:e.gl.isContextLost(),settle:!!e._settle,rebuilds:e._rebuildJobs.size,queue:e._opQueue.length,revision:e._log.revision,strokeCount:e.getOperations().filter(o=>o.type==="stroke").length,stalls:JSON.parse(__mt.stalls())}})()`)
    report.runs.push({size,metrics,state});save()
    if(state.gl||state.lost)throw Error('Stroke GL failure')
    await wait('!__engine._settle && !__engine._opQueue.length && !__engine._rebuildJobs.size && !__engine._pendingRebuilds.size')
  }
  report.undoRedo = await evaluate(`(async()=>{const e=__engine; const wait=async()=>{for(let i=0;i<240;i++){if(!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size)return;await new Promise(r=>setTimeout(r,250))}throw Error('Undo/redo idle timeout')};e.watercolorDryAll();await wait();const snap=async()=>{const blob=await e.exportPNG(true);if(!blob)throw Error('PNG missing');const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;window.__qaPNGs??=[];window.__qaPNGs.push({data:await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob)}),rgba});return{size:blob.size,sha:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('')}};const before=await snap();e.undo();await wait();const undone=await snap();e.redo();await wait();const restored=await snap();let changed=0,max=0,alphaMax=0,over8=0;const a=__qaPNGs[0].rgba,b=__qaPNGs[2].rgba;for(let i=0;i<a.length;i+=4){let m=0;for(let c=0;c<4;c++)m=Math.max(m,Math.abs(a[i+c]-b[i+c]));if(m)changed++;if(m>8)over8++;max=Math.max(max,m);alphaMax=Math.max(alphaMax,Math.abs(a[i+3]-b[i+3]));}return{pixels:{changed,max,alphaMax,over8,length:a.length},before,undone,restored,restoredExact:before.sha===restored.sha,undoChanged:before.sha!==undone.sha,gl:e.gl.getError(),lost:e.gl.isContextLost()};})()`)
  for(let i=0;i<3;i++){const data=await evaluate(`__qaPNGs[${i}].data`);fs.writeFileSync(`temp/device-runs/samsung-precision-sizes-${['before','undo','redo'][i]}.png`,Buffer.from(data.split(',')[1],'base64'))}
  if(!report.undoRedo.restoredExact||!report.undoRedo.undoChanged||report.undoRedo.gl||report.undoRedo.lost)throw Error('Actual undo/redo canonical check failed')
  report.after=await evaluate(`(()=>{const e=__engine;return{ops:e.getOperations().length,pending:e._log.entries.filter(x=>x.pending).length,gl:e.gl.getError(),lost:e.gl.isContextLost(),perf:e.getWatercolorPerf()}})()`)
  report.pass=!report.after.gl&&!report.after.lost&&!report.after.pending&&report.runs.length===3&&!report.errors.length
  if(!report.pass)throw Error('Functional penbench oracle failed')

} catch (error) { report.error = String(error); process.exitCode = 1 }
finally {
  clearTimeout(wall)
  save()
  if (ws) ws.close()
  if (target) { await fetch(`${base}/json/close/${target.id}`); report.ownTargetClosed = true; save() }
}
console.log(JSON.stringify({ pass: report.pass, targetId: report.targetId, ownTargetClosed: report.ownTargetClosed, passport:report.passport,runs:report.runs,after:report.after,error:report.error }))
