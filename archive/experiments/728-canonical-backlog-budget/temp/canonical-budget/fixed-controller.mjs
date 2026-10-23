import {createRequire} from 'node:module'
const require=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json'),WebSocket=require('ws')
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const base = 'http://127.0.0.1:9338', nonce = 'canonicalBudget_' + Date.now(), out = 'temp/canonical-budget/fixed-' + nonce
fs.mkdirSync(out, { recursive: true })
const report = { source: '059809f8 canonicalbacklog OFF/ON normal original1396 replay+explicitFIFOwaiter; noRoom/nativeFPSclaim', budgetFence:process.env.BUDGET_FENCE==='1',fenceScope:'Queue only; drawing/FIFO unchanged' , nonce, cases: [], errors: [] }
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

const wall=setTimeout(()=>{report.wallTimeout=true;save();if(target)void fetch(base+'/json/close/'+target.id);ws?.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('bounded fixed watchdog'));}pending.clear()},300000);
try{
 const row={key:'fixed1396'};report.cases.push(row);row.target=await open('https://192.168.1.70:5330/create?qa='+nonce);await wait('document.readyState==="complete"');
 const input=JSON.parse(fs.readFileSync('temp/canonical-budget/retained1396-input.json','utf8'));const fn=fs.readFileSync('temp/canonical-budget/fixed-function.js','utf8');new Function(fn);row.filePassport=JSON.parse(fs.readFileSync('temp/canonical-budget/source-passport.json','utf8'));row.inputSHA='8649e8ad1245ac09b5b2ec4e2781c3a0a91b4eae4ff37bb2cb0307485afd829f';save();
 await ev(`window.__fixedDone=null;window.__fixedError=null;window.__presentationPartial=null;(${fn})(${JSON.stringify(input)}).then(x=>__fixedDone=x).catch(x=>__fixedError=String(x));true`);
 await wait('window.__fixedDone||window.__fixedError',270000);const error=await ev('__fixedError');row.partial=await ev('__presentationPartial');if(error)throw Error(error);row.result=await ev('__fixedDone');save();if(row.result.results.some(x=>x.gl||x.lost||x.comparisons.some(c=>c.changed)))throw Error('fixed fields/whole endpoint');row.complete=true;save();await close();
}catch(e){report.error=String(e);try{report.partial=await ev('__presentationPartial')}catch{}save();process.exitCode=1}
finally{clearTimeout(wall);await close();report.closed=true;save()}
console.log(JSON.stringify({out,error:report.error,closed:report.closed}));
