import {createRequire} from 'node:module'
const require=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json'),WebSocket=require('ws')
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const base = 'http://127.0.0.1:9338', nonce = 'zeroproof321d_' + Date.now(), out = 'temp/pure-water-plan/hardware/run-' + nonce
fs.mkdirSync(out, { recursive: true })
const report={source:'f52a2b94919a71e9c763d81cd39be6e8cd6c1423',nonce,cases:[],errors:[],scope:'Pure-water Plan OFF/ON fixed tape; not Room/native performance proof'}
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

const DIR='temp/pure-water-plan/hardware',APP=process.env.APP_URL,ROOT=process.env.WC_QA_RUNTIME_ROOT;
if(!APP||!ROOT||!['5331','5333'].includes(new URL(APP).port))throw Error('Explicit owned candidate runtime/port required');
const wall=setTimeout(()=>{report.wallTimeout=true;save();if(target)void fetch(base+'/json/close/'+target.id)},900000);
try{
 const manifest=JSON.parse(fs.readFileSync(DIR+'/source-manifest.json','utf8'));
 report.source=manifest.source;report.base=manifest.base;report.sourceFiles=manifest.files.length;report.scope='fixed immutable tapes; canonical/source fields byte SHA and wholeRGBA equality; not native FPS';
 const verify=`import fs from 'node:fs';import crypto from 'node:crypto';const root=${JSON.stringify(ROOT)},m=${JSON.stringify(manifest)};for(const r of m.files)if(crypto.createHash('sha256').update(fs.readFileSync(root+'/'+r.path)).digest('hex')!==r.sha256)throw Error(r.path);console.log(JSON.stringify({source:m.source,files:m.files.length,verified:true}));`;
 report.actualSource=JSON.parse(execFileSync('ssh',['-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p','22022','suselman@127.0.0.1','node --input-type=module -'],{input:verify,encoding:'utf8',timeout:20000}));
 const mem=()=>Number(execFileSync('ssh',['-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p','22022','suselman@127.0.0.1','cat /proc/meminfo'],{encoding:'utf8',timeout:10000}).split(String.fromCharCode(10)).find(line=>line.startsWith('MemAvailable:')).split(':')[1].trim().split(' ')[0])/1024;
 report.preflightRAM=mem();if(report.preflightRAM<1700)throw Error('RAM preflight1700');
 report.serial=execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','getprop','ro.serialno'],{encoding:'utf8',timeout:10000}).trim();if(report.serial!=='R52RB0JXVSY')throw Error('Device identity');
 const fixture=JSON.parse(fs.readFileSync(DIR+'/cases.json','utf8')),fn=fs.readFileSync(DIR+'/gate-function.js','utf8'),sha=fs.readFileSync(DIR+'/sha256-function.js','utf8');
 new Function('return '+fn);new Function('return '+sha);report.fixture=fixture;save();
 for(const item of fixture.cases){
  if(mem()<1700)throw Error('RAM between arms1700');const row={key:item.name};report.cases.push(row);save();
  row.target=await open(APP+'/create?qa='+nonce+'-'+item.name);await wait('document.visibilityState==="visible"');
  await ev('window.__pureSHA='+sha+';true');
  await ev(`window.__fixedDone=null;window.__fixedError=null;window.__presentationPartial=null;(${fn})(${JSON.stringify(item.input)}).then(x=>__fixedDone=x).catch(x=>__fixedError=String(x));true`);
  const end=Date.now()+240000;
  while(Date.now()<end){if(mem()<500)throw Error('RAM runtime500');if(await ev('Boolean(window.__fixedDone||window.__fixedError)'))break;await new Promise(r=>setTimeout(r,1000))}
  const error=await ev('window.__fixedError');row.partial=await ev('window.__presentationPartial');if(error)throw Error(error);row.result=await ev('__fixedDone');if(!row.result)throw Error('Phase240s deadline');
  if(row.result.results.some(x=>x.gl||x.lost||x.comparisons.some(c=>!c.diagnosticOnly&&!c.equal)))throw Error('Strict canonical/source/whole fields');
  row.complete=true;save();await close();
 }
 report.complete=true;
}catch(error){report.error=String(error);try{report.partial=await ev('window.__presentationPartial')}catch{}process.exitCode=1}
finally{clearTimeout(wall);await close();report.closed=true;save()}
console.log(JSON.stringify({out,complete:report.complete,error:report.error,closed:report.closed}));
