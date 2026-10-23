import WebSocket from 'ws'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:9338'
const salt = `qa_guard_${Date.now()}`
const url = `https://192.168.1.70:5316/tone-review728.html?qa=${salt}`
const out = 'temp/device-runs/samsung728-tone.json'
const report = { source: '4fdf04e2 rect fix; tone baseline/current0.35/exact0.5 and paint0.12', salt, url, errors: [] }
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
    } else if (result.method === 'Runtime.exceptionThrown') report.errors.push(result.params.exceptionDetails.text)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await wait('!!window.toneReview');
  await evaluate("toneReview.run().then(r=>window.__toneResult=r).catch(e=>window.__toneError=String(e));true");
  await wait('!!window.__toneResult||!!window.__toneError');
  const err=await evaluate('window.__toneError');if(err)throw Error(err);
  report.result=await evaluate('window.__toneResult');
  report.coldLinks=await evaluate('window.__coldLinks');
  for(const item of report.result.cases){for(const key of ['screenWet','exportWhileWet']){fs.writeFileSync('temp/device-runs/samsung-tone-'+item.variant+'-'+key+'.png',Buffer.from(item[key].split(',')[1],'base64'));delete item[key]}}
  for(const key of ['dryBefore','screenBefore','dryAfter','rebuild','undo','redo','baselineRebuild','baselineRedo']){fs.writeFileSync('temp/device-runs/samsung-tone-'+key+'.png',Buffer.from(report.result[key].split(',')[1],'base64'));delete report.result[key]}
  if(!report.result.renderer.includes('Adreno')||report.result.gl||report.result.lost||report.coldLinks.some(x=>!x.ok))throw Error('Adreno/GL/cold links failed');report.pass=true;

} catch (error) { report.error = String(error); process.exitCode = 1 }
finally {
  clearTimeout(wall)
  save()
  if (ws) ws.close()
  if (target) { await fetch(`${base}/json/close/${target.id}`); report.ownTargetClosed = true; save() }
}
console.log(JSON.stringify({ pass: report.pass, targetId: report.targetId, ownTargetClosed: report.ownTargetClosed, passport:report.passport,runs:report.runs,after:report.after,error:report.error }))
