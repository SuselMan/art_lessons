import WebSocket from 'ws'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:9341'
const salt = `qa_guard_${Date.now()}`
const url = `https://192.168.1.70:5316/zero-review728.html?qa=${salt}`
const out = 'temp/device-runs/samsung728-zero-contact.json'
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
  await wait('!!window.zeroReview&&document.visibilityState==="visible"');
  report.runs=[];report.journals={};
  const run=async(kind,skip,capture=false)=>{
    if(!report.journals[kind])report.journals[kind]=await evaluate(`zeroReview.journal(${JSON.stringify(kind)})`);
    const ops=report.journals[kind];save();
    await evaluate(`window.__zeroResult=null;window.__zeroError=null;zeroReview.run(${JSON.stringify(ops)},${skip},${capture}).then(r=>window.__zeroResult=r).catch(e=>window.__zeroError=String(e));true`);
    await wait('!!window.__zeroResult||!!window.__zeroError');
    const err=await evaluate('window.__zeroError');if(err)throw Error(err);
    const r=await evaluate('window.__zeroResult');
    if(!r.renderer.includes('Adreno')||r.gl||r.lost||!r.dry.painted)throw Error('Adreno/GL/lost/nonempty');
    for(const [i,phase]of r.phases.entries()){fs.writeFileSync(`temp/device-runs/samsung-zero-${kind}-${skip}-${capture}-${report.runs.length}-phase${i}.png`,Buffer.from(phase.png.data.split(',')[1],'base64'));delete phase.png.data}
    for(const k of ['dry','rebuild']){fs.writeFileSync(`temp/device-runs/samsung-zero-${kind}-${skip}-${capture}-${report.runs.length}-${k}.png`,Buffer.from(r[k].data.split(',')[1],'base64'));delete r[k].data}
    report.runs.push({kind,skip,capture,r});save();return r;
  };
  await run('400',false,false);report.runs[0].warmupOnly=true;
  for(const kind of ['400','dense400','painted']){
    const a=await run(kind,false,false),b=await run(kind,true,false),c=await run(kind,false,false);
    const endpoint=r=>JSON.stringify({phases:r.phases.map(x=>x.png),dry:r.dry,rebuild:r.rebuild});
    if(endpoint(a)!==endpoint(b)||endpoint(a)!==endpoint(c))throw Error('balanced pixel mismatch '+kind);
  }
  const a=await run('foreign',false,true),b=await run('foreign',true,true);
  if(JSON.stringify(a.stages.map(x=>x.fields))!==JSON.stringify(b.stages.map(x=>x.fields)))throw Error('material mismatch');
  report.pass=true;

} catch (error) { report.error = String(error); process.exitCode = 1 }
finally {
  clearTimeout(wall)
  save()
  if (ws) ws.close()
  if (target) { await fetch(`${base}/json/close/${target.id}`); report.ownTargetClosed = true; save() }
}
console.log(JSON.stringify({ pass: report.pass, targetId: report.targetId, ownTargetClosed: report.ownTargetClosed, passport:report.passport,runs:report.runs,after:report.after,error:report.error }))
