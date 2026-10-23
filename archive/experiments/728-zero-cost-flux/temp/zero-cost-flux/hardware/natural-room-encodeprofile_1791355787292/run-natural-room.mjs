import {createRequire} from 'node:module'
const require=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json'),WebSocket=require('ws')
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const base = 'http://127.0.0.1:9338', nonce = 'encodeprofile_' + Date.now(), out = 'temp/zero-cost-flux/hardware/natural-room-' + nonce
fs.mkdirSync(out, { recursive: true })
const report = { source: '6f76794f/base40c402e0 + ONLY encoding c866e9fa two source files, backend4539 current7b11', budgetFence:process.env.BUDGET_FENCE==='1',fenceScope:'drawing/FIFO only; Queue original finish' , nonce, cases: [], errors: [] }
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
const idleExpression = `(async()=>{const start=performance.now();let states=[];while(true){const e=__engine,x={at:performance.now(),queue:e._wcCanonical.pending,requests:e._wcCanonical.requests.length,settle:!!e._settle,opQueue:e._opQueue.length,rebuild:e._rebuildJobs.size,pending:e._pendingRebuilds.size,reveals:e._washReveals.size,lost:e.gl.isContextLost(),error:e._wcAsyncError&&String(e._wcAsyncError)};if(!x.queue&&!x.settle&&!x.opQueue&&!x.rebuild&&!x.pending&&!x.reveals&&!x.lost){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return states}if(performance.now()-start>120000)throw Error('idle120 '+JSON.stringify(x));if(!states.length||x.at-states[states.length-1].at>5000)states.push(x);await new Promise(r=>setTimeout(r,30))}})()`
const snapExpression = `(async()=>{const e=__engine,b=await e.exportPNG(true);if(!b)throw Error('PNG absent');const i=await createImageBitmap(b),c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);i.close();const a=g.getImageData(0,0,c.width,c.height).data;let painted=0;for(let k=3;k<a.length;k+=4)painted+=a[k]>0;const dimensions=[c.width,c.height];c.width=c.height=0;const png=await new Promise((r,j)=>{const f=new FileReader();f.onload=()=>r(f.result);f.onerror=j;f.readAsDataURL(b)});return{png,painted,dimensions,journal:JSON.parse(JSON.stringify(e._log.entries.map(x=>({op:{...x.op,seq:x.serverSeq},state:x.state,pending:x.pending,serverSeq:x.serverSeq})))),gl:e.gl.getError(),lost:e.gl.isContextLost(),owners:e._wcAsyncOwners.size,presentations:e._wcAsyncPresentations.size}})()`
async function snapshot(row, name) { const r = await task(snapExpression); fs.writeFileSync(out + '/' + row.key + '-' + name + '.png', Buffer.from(r.png.split(',')[1], 'base64')); delete r.png; row[name] = r; save(); if (r.gl || r.lost) throw Error('GL/lost ' + name); return r }
async function button(pattern) { return ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>[b.innerText,b.getAttribute('aria-label')].some(v=>/${pattern}/.test((v||'').trim()))&&!b.disabled&&b.getBoundingClientRect().width);if(!b)throw Error('button unavailable ${pattern}');b.click();return true})()`) }
const wall=setTimeout(()=>{report.wallTimeout=true;save();if(target)void fetch(base+'/json/close/'+target.id)},240000);
try{
 report.target=await open('https://192.168.1.70:5329/create?qa='+nonce);
 await wait(`document.querySelector('form input[type=text]')`);
 await ev(`(()=>{const set=(i,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}))};set(document.querySelector('form input[type=text]'),'728 Natural Mixed QA');const c=[...document.querySelectorAll('*')].find(x=>/^(Custom|Свой)$/.test(x.textContent)&&!x.children.length);if(!c)throw Error('Custom selector');c.click();return true})()`);
 await wait(`document.querySelectorAll('input[type=number]').length>=2`);
 await ev(`(()=>{const set=(i,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}))};const n=document.querySelectorAll('input[type=number]');set(n[0],'640');set(n[1],'480');document.querySelector('form button[type=submit]').click();return true})()`);
 await wait('window.__engine&&window.__roomStore');await ev('__engine.paperReady().then(()=>true)');report.room=await ev('__roomStore.getState().room');report.url=await ev('location.href');if(report.room.width!==640||report.room.height!==480)throw Error('Physical dimensions');
 await button('^(Fit canvas|Вписать холст)$');await ev(fs.readFileSync('apps/web/scripts/devices/pageLib.js','utf8'));
 const helper=fs.readFileSync('temp/zero-cost-flux/hardware/natural-two-colour-function.js','utf8');new Function('return '+helper);
 report.result=await task('('+helper+')({additive:true})',150000);report.completed=true;
}catch(error){report.error=String(error);if(ws){try{report.partial=await ev('window.__naturalPartial??null');report.dom=await ev('document.body.innerText.slice(0,2000)')}catch{}}process.exitCode=1}
finally{clearTimeout(wall);await close();report.ownClosed=true;save()}
console.log(JSON.stringify({complete:report.completed,error:report.error,closed:report.ownClosed,out}));
