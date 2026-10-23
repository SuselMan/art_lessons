import WebSocket from 'ws'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:9338'
const salt = `qa_guard_${Date.now()}`
const url = `https://192.168.1.70:5316/source-rebase-phases728.html?qa=${salt}`
const out = 'temp/device-runs/samsung728-source-rebase-phases.json'
const report = { source: '0e0cbe77 zero-contact default OFF, warm balanced synthetic fixed journals', salt, url, errors: [] }
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
  for (let i = 0; i < 500; i++) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw Error(`Condition timeout: ${expression}`)
}
const wall = setTimeout(() => {
  report.wallTimeout = true
  if (target) void fetch(`${base}/json/close/${target.id}`)
}, 300000)
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
  await wait('!!window.historyReview&&document.visibilityState==="visible"');
  await evaluate(`{const original=historyReview.run;historyReview.run=async(mode)=>{const intervals=[];let active=true,last=performance.now();const tick=t=>{intervals.push({dt:t-last,...historyReview.state()});last=t;if(active)requestAnimationFrame(tick)};requestAnimationFrame(tick);try{const r=await original(mode);r.raf=intervals;return r}finally{active=false}}}true`);report.runs=[]; report.source='57792769';
  for(const mode of ['off','film']){
    await evaluate(`window.__result=null;window.__error=null;historyReview.run(${JSON.stringify(mode)}).then(r=>window.__result=r).catch(e=>window.__error=String(e));true`);
    await wait('!!window.__result||!!window.__error');
    const err=await evaluate('window.__error');if(err)throw Error(err);
    const r=await evaluate('window.__result');
    for(const k of ['native','redo','rebuild']){if(r[k]){fs.writeFileSync(`temp/device-runs/samsung-source-rebase-phases-${mode}-${k}.png`,Buffer.from(r[k].split(',')[1],'base64'));delete r[k]}}
    r.renderer=await evaluate('(()=>{const g=document.querySelector("canvas").getContext("webgl");const d=g.getExtension("WEBGL_debug_renderer_info");return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)})()');if(!r.renderer.includes('Adreno'))throw Error('not Adreno');report.runs.push(r);save();if(r.gl||r.lost)throw Error('GL/lost');
  }
  report.pass=true;

} catch (error) { report.error = String(error); process.exitCode = 1 }
finally {
  clearTimeout(wall)
  save()
  if (ws) ws.close()
  if (target) { await fetch(`${base}/json/close/${target.id}`); report.ownTargetClosed = true; save() }
}
console.log(JSON.stringify({ pass: report.pass, targetId: report.targetId, ownTargetClosed: report.ownTargetClosed, passport:report.passport,runs:report.runs,after:report.after,error:report.error }))
