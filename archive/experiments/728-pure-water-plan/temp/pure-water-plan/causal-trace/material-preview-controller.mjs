import {createRequire} from 'node:module'
const require=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json'),WebSocket=require('ws')
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const base = 'http://127.0.0.1:9338', nonce = 'materialPreview79_'  + Date.now(), out = 'temp/pure-water-plan/causal-trace/native-' + nonce
fs.mkdirSync(out, { recursive: true })
const report={source:'79df45400676df0a2bdf63a9ed6ad2535ddf33a4',scope:'single local layer visible material prototype; cap/camera/peer unclosed',nonce,errors:[],stages:[]};
let monitor;
let target, ws, sequence = 0, tracing=false, traceFinished
const pending = new Map()
const save = () => fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2))
const send = (method, params = {}) => new Promise((resolve, reject) => {
  if(!ws || ws.readyState!==WebSocket.OPEN){reject(Error('own CDP not connected'));return}
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)) }, 60000)
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }))
})
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
const wait = async (expression, limit = 30000) => { const deadline = Date.now() + limit; while (Date.now() < deadline) { if (await ev('Boolean(' + expression + ')')) return; await new Promise(r => setTimeout(r, 250)) } throw Error('condition timeout: ' + expression) }
const task = async (expression, limit = 120000) => { await ev(`window.__qaResult=null;window.__qaError=null;(${expression}).then(x=>window.__qaResult={value:x}).catch(x=>window.__qaError=String(x));true`); await wait('window.__qaResult||window.__qaError', limit); const error = await ev('window.__qaError'); if (error) throw Error(error); return ev('window.__qaResult.value') }
async function close() { ws?.close(); ws = null; if (target) { const id = target.id; await fetch(base + '/json/close/' + id); (report.closedTargets ??= []).push(id); target = null; save() } }
async function open(url) {
  const known = new Set((await (await fetch(base + '/json/list')).json()).map(x => x.id))
  const parent=(await (await fetch(base+'/json/list')).json()).find(x=>x.type==='page'&&x.url.startsWith('https://192.168.1.70:5329/'));
  if(!parent)throw Error('known protected page absent');
  const channel=new WebSocket(parent.webSocketDebuggerUrl);await new Promise((r,j)=>{channel.once('open',r);channel.once('error',j)});
  let seq=0;const call=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{channel.off('message',receive);reject(Error('parent readonly/open timeout'))},10000);const receive=raw=>{const m=JSON.parse(raw);if(m.id===id){clearTimeout(timer);channel.off('message',receive);m.error?reject(Error(m.error.message)):resolve(m.result)}};channel.on('message',receive);channel.send(JSON.stringify({id,method,params}))});
  try{
    const before=await call('Runtime.evaluate',{expression:'({url:location.href,timeOrigin:performance.timeOrigin,active:!!window.__engine?!!__engine._strokeLayerId:false})',returnByValue:true});
    if(before.result.value.active)throw Error('protected pen active');
    report.parentBefore=before.result.value;
    const opened=await call('Runtime.evaluate',{expression:'Boolean(window.open('+JSON.stringify(url)+',"_blank"))',userGesture:true,returnByValue:true});report.windowOpen=opened.result?.value;save();
    for(let i=0;i<40&&!target;i++){target=(await(await fetch(base+'/json/list')).json()).find(x=>!known.has(x.id)&&x.url===url);if(!target)await new Promise(r=>setTimeout(r,250))}
    const after=await call('Runtime.evaluate',{expression:'({url:location.href,timeOrigin:performance.timeOrigin})',returnByValue:true});report.parentAfter=after.result.value;
    if(report.parentBefore.url!==report.parentAfter.url||report.parentBefore.timeOrigin!==report.parentAfter.timeOrigin)throw Error('protected page changed');
  }finally{channel.close()}
  if (!target) throw Error('new exact own target unavailable')
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.once('open', r); ws.once('error', j) })
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result) } else if(m.method==='Tracing.tracingComplete')traceFinished=m.params;else if (m.method === 'Runtime.exceptionThrown') report.errors.push(m.params.exceptionDetails.text) })
  await send('Performance.enable'); await send('Runtime.enable'); await send('Page.enable'); await wait('document.visibilityState==="visible"'); return target.id
}

const state = async()=>ev(`(()=>{const e=__engine,o=[...e._wcMaterialOwners.layers.values()];return{at:performance.now(),url:location.href,visible:document.visibilityState,gpu:e.gpuInfo(),lost:e.gl.isContextLost(),gl:e.gl.getError(),async:e._wcAsyncFinish,material:e._wcMaterialPresentation,error:e._wcAsyncError&&String(e._wcAsyncError),queue:e._wcCanonical.pending,requests:e._wcCanonical.requests.length,settle:!!e._settle,owners:o.map(o=>({layer:o.layerId,extent:o.extent,pending:o.pending.size,pool:o.material.pool.bytes,wet:o.material.raster.paperWet.peak(performance.now())})),reserved:e._wcMaterialOwners.bytes,ops:e._log.entries.map(x=>({id:x.op.id,type:x.op.type,serverSeq:x.serverSeq,pending:x.pending,state:x.state,preset:x.op.preset,color:x.op.color}))}})()`);
const screen=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(r.data,'base64'));report.stages.push({name,state:await state()});save()};
const button=async text=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>[b.innerText,b.getAttribute('aria-label')].some(x=>x&&new RegExp(${JSON.stringify(text)}).test(x)));if(!b||b.disabled)throw Error('button '+${JSON.stringify(text)});b.click();return true})()`);
const memory=()=>Number(execFileSync('ssh',['-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p','22022','suselman@127.0.0.1','cat /proc/meminfo'],{encoding:'utf8',timeout:10000}).split('\n').find(x=>x.startsWith('MemAvailable:')).split(':')[1].trim().split(' ')[0])/1024;
const wall=setTimeout(()=>{report.wallTimeout=true;save();if(target)void fetch(base+'/json/close/'+target.id)},240000);
try{
 report.preflightMiB=memory();if(report.preflightMiB<1700)throw Error('preflight1700');
 monitor=setInterval(()=>{try{const m=memory();report.minMiB=Math.min(report.minMiB??m,m);if(m<500){report.memoryAbort=true;save();if(target)void fetch(base+'/json/close/'+target.id)}}catch{}},5000);monitor.unref();
 report.target=await open('https://192.168.1.70:5331/create?qa='+nonce);save();
 await wait(`document.querySelector('form input[type=text]')`);
 await ev(`(()=>{const i=document.querySelector('form input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'728 material preview');i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form button[type=submit]').click();return true})()`);
 await wait('window.__engine&&window.__roomStore',30000);await ev('__engine.paperReady().then(()=>true)');
 await button('^(Fit canvas|Вписать холст)$');
 await ev(`(()=>{const e=__engine;if(!e._wcAsyncFinish||!e._wcMaterialOwners)throw Error('candidate missing');e._wcMaterialPresentation=true;const s=__roomStore.getState();s.setTool('watercolor');s.setToolSetting('watercolor','water',1);s.setToolSetting('watercolor','pigment',0);s.setToolSetting('watercolor','size',180);return true})()`);
 await ev(fs.readFileSync('/home/suselman/projects/pencil-agents/728-pure-water-plan/temp/pure-water-plan/causal-trace/native-nexttouch-bounded.js','utf8'));
 await screen('before');
 report.water=JSON.parse(await task(`__mt.stroke({pts:[[.3,.4],[.6,.4]],ms:700,perFrame:2})`,30000));save();await screen('water-pending');
 await ev(`(()=>{const s=__roomStore.getState();s.setToolSetting('watercolor','pigment',1);s.setToolSetting('watercolor','size',86);s.setToolSetting('watercolor','color',[.6,0,.35]);return true})()`);
 await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
 report.pigment=JSON.parse(await task(`__mt.stroke({pts:[[.35,.4],[.55,.4]],ms:700,perFrame:2})`,30000));save();await screen('pigment-pending');
 const pendingStage=report.stages.at(-1).state;if(!pendingStage.owners.length||!pendingStage.owners.some(o=>o.wet>0)||pendingStage.error||pendingStage.lost||pendingStage.gl)throw Error('meaningful material precondition');
 await wait('!__engine._wcCanonical.pending&&!__engine._settle&&!__engine._washReveals.size',150000);await screen('canonical-handoff');
 report.complete=true;save();
}catch(e){report.error=String(e);try{report.failure=await state()}catch{}save();process.exitCode=1}
finally{clearTimeout(wall);clearInterval(monitor);await close();report.closed=true;save()}
console.log(JSON.stringify({out,complete:report.complete,error:report.error,closed:report.closed}));
