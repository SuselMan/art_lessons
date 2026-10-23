import {createRequire} from 'node:module'
const require=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json'),WebSocket=require('ws')
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
if(process.env.QA_GPU_GRANT!=='explicit-root-grant')throw Error('GPU grant required before running prepared controller');
if(!process.env.QA_URL||!process.env.QA_SOURCE_PASSPORT)throw Error('Owned immutable runtime URL/passport required');
const fn=fs.readFileSync('temp/clear-prefix-gate/page-function.js','utf8'),input=JSON.parse(fs.readFileSync('temp/clear-prefix-gate/input.json','utf8')),passport=JSON.parse(fs.readFileSync(process.env.QA_SOURCE_PASSPORT,'utf8'));
new Function('return ('+fn+')');if(passport.commit!=='ca0b61299aeab32be83514157c09356e7878fafe')throw Error('Exact candidate passport required');
if(passport.files.some(x=>x.exact===false))throw Error('Runtime source mismatch');
const base = 'http://127.0.0.1:9338', nonce = 'clear47ca0_' + Date.now(), out = 'temp/clear-prefix-gate/runs/' + nonce
fs.mkdirSync(out, { recursive: true })
const report = { source: 'ca0b6129 actual helper + current samephysical source; immutable retained47; standalone correctness/timing separated', nonce, cases: [], errors: [] }
let target, ws, sequence = 0
const pending = new Map()
const save = () => fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2))
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)) }, 15000)
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }))
})
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
const wait = async (expression, limit = 30000) => { const deadline = Date.now() + limit; while (Date.now() < deadline) { if (await ev('Boolean(' + expression + ')')) return; await new Promise(r => setTimeout(r, 250)) } throw Error('condition timeout: ' + expression) }
const task = async (expression, limit = 120000) => { await ev(`window.__qaResult=null;window.__qaError=null;(${expression}).then(x=>window.__qaResult={value:x}).catch(x=>window.__qaError=String(x));true`); await wait('window.__qaResult||window.__qaError', limit); const error = await ev('window.__qaError'); if (error) throw Error(error); return ev('window.__qaResult.value') }
async function close() { ws?.close(); ws = null; if (target) { const id = target.id; await fetch(base + '/json/close/' + id); (report.closedTargets ??= []).push(id); target = null; save() } }
async function open(url) {
  const known = new Set((await (await fetch(base + '/json/list')).json()).map(x => x.id))
  execFileSync('/home/suselman/.local/bin/home-devices', ['adb', 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-p', 'com.android.chrome', '--ez', 'create_new_tab', 'true'], { timeout: 15000 })
  for (let i = 0; i < 40 && !target; i++) { target = (await (await fetch(base + '/json/list')).json()).find(x => !known.has(x.id) && x.url === url); if (!target) await new Promise(r => setTimeout(r, 250)) }
  if (!target) throw Error('new exact own target unavailable')
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.once('open', r); ws.once('error', j) })
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result) } else if (m.method === 'Runtime.exceptionThrown') report.errors.push(m.params.exceptionDetails.text) })
  await send('Performance.enable'); await send('Runtime.enable'); await send('Page.enable'); await wait('document.visibilityState==="visible"'); return target.id
}

const wall=setTimeout(()=>{report.wallTimeout=true;save();if(target)void fetch(base+'/json/close/'+target.id);ws?.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('bounded600s watchdog'))}pending.clear()},600000);
try{
 const row={key:'retained47'};report.cases.push(row);row.sourcePassport=passport;save();row.target=await open(process.env.QA_URL+'?qa='+nonce);await wait('document.readyState==="complete"');
 row.rawSource=await ev(`(async()=>{const paths=['/src/engine/index.ts','/src/pages/Room/clearedInBatch.ts','/src/pages/Room/undoneInBatch.ts','/src/engine/src/raster/WatercolorSettlePlan.ts'];const rows=[];for(const path of paths){const raw=(await import(path+'?raw')).default,bytes=new TextEncoder().encode(raw),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');rows.push({path,hash})}return rows})()`);
 for(const r of row.rawSource){const expected=passport.files.find(f=>f.path==='apps/web'+r.path);if(!expected||expected.sha256!==r.hash)throw Error('Loaded source mismatch '+r.path)}save();
 await ev(`window.__clearDone=null;window.__clearError=null;window.__clearPartial=null;setTimeout(()=>{(${fn})(${JSON.stringify(input)}).then(x=>__clearDone=x).catch(x=>__clearError=String(x))},0);true`);
 {const end=Date.now()+570000;while(!await ev('Boolean(window.__clearDone||window.__clearError)')){if(Date.now()>end)throw Error('gate570s timeout');row.partial=await ev('__clearPartial');save();await new Promise(r=>setTimeout(r,2000))}}const error=await ev('__clearError');row.partial=await ev('__clearPartial');save();if(error)throw Error(error);row.result=await ev('__clearDone');save();if(row.result.results.some(r=>r.gl||r.lost||r.comparisons.some(c=>c.changed)))throw Error('full physical/PNG mismatch');row.complete=true;save();
}catch(e){report.error=String(e);try{report.partial=await ev('__clearPartial')}catch{}save();process.exitCode=1}finally{clearTimeout(wall);await close();report.closed=true;save()}
console.log(JSON.stringify({out,error:report.error,closed:report.closed}));
