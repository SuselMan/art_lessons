import fs from 'node:fs'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
const require=createRequire(new URL('../../../../package.json',import.meta.url)),WebSocket=require('ws')
const app=process.env.QA_APP,base=process.env.CDP_BASE,out=process.env.QA_OUT
if(!app||!base||!out||!process.env.QA_MANIFEST||new URL(app).port!=='5349')throw Error('Explicit frozen native QA_APP:5349, CDP_BASE and QA_OUT required')
fs.mkdirSync(out,{recursive:true})
const report={source:process.env.QA_SOURCE,stage:'preflight',errors:[],events:[],limitations:['Actual Room pointer/GL display test, not full parity','foreign wash/multitile explicit unsupported; no GPU duration from wall time']}
let target,ws,seq=0;const pending=new Map()
const save=()=>fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2))
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async(fn,arg)=>{const r=await send('Runtime.evaluate',{expression:typeof fn==='function'?'('+fn.toString()+')('+JSON.stringify(arg??null)+')':fn,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
async function wait(fn,ms=45000){const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(fn))return;await new Promise(r=>setTimeout(r,150))}throw Error('Bounded Room readiness timeout')}
const memory=()=>{const raw=execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','cat','/proc/meminfo'],{encoding:'utf8',timeout:12000});const m=raw.match(/MemAvailable:\s*(\d+)/);if(!m)throw Error('Samsung RAM unavailable');return +m[1]/1024}
async function census(){return evaluate(()=>{const e=window.__engine;return{url:location.href,secure:isSecureContext,gpu:!!navigator.gpu,ua:navigator.userAgent,engine:!!e,native:e?._wcNativeEnabled,ready:!!e?._wcNative,pending:e?._wcCanonical?.pending,error:e?._wcAsyncError?String(e._wcAsyncError):null,ops:e?._log.entries.map(x=>({type:x.op.type,tool:x.op.tool,state:x.state,dabs:x.op.dabs?.length,preset:x.op.preset,wet:x.op.wet})),lost:e?.gl.isContextLost()}})}
async function idle(){await wait(()=>{const e=window.__engine;return!!e&&(!e._wcCanonical.pending&&!e._settle||!!e._wcAsyncError)},60000);const result=await census();report.events.push(result);save();if(result.error)throw Error(result.error)}
async function stroke(preset,points){
 const before=(await census()).ops.filter(op=>op.type==='stroke').length
 await evaluate(p=>{const e=window.__engine;e.setTool('watercolor');e.setPencil(p);e.setSize(40);e.setColor([.2,0,.6]);if(e._opts.tool!=='watercolor'||e._opts.size!==40||e._opts.pencilType!==p)throw Error('Actual engine settings setter mismatch')},preset)
 const xy=await evaluate(points=>{const e=window.__engine,m=e._camera.screenToWorldMatrix(),r=e.canvas.getBoundingClientRect(),det=m[0]*m[4]-m[3]*m[1];return points.map(([wx,wy])=>{const dx=wx-m[6],dy=wy-m[7];return{x:r.left+(m[4]*dx-m[3]*dy)/det/e.canvas.width*r.width,y:r.top+(-m[1]*dx+m[0]*dy)/det/e.canvas.height*r.height}})},points)
 for(let i=0;i<xy.length;i++){const p=xy[i];await send('Input.dispatchMouseEvent',{type:i?'mouseMoved':'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,pointerType:'pen',force:.7});await new Promise(r=>setTimeout(r,25))}
 const p=xy.at(-1);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,pointerType:'pen',force:0});await idle();const after=await census();if(after.ops.filter(op=>op.type==='stroke').length<=before)throw Error('Real pointer produced no packed StrokeOperation')
}
let monitor
try{
 const manifest=JSON.parse(fs.readFileSync(process.env.QA_MANIFEST));report.manifestHead=manifest.head
 if(manifest.head!==process.env.QA_SOURCE)throw Error('Frozen manifest head differs from requested source')
 report.httpPassport=[]
 for(const path of ['apps/web/src/engine/index.ts','apps/web/src/engine/src/webgpuCanonical/roomNativeRuntime.ts','apps/web/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts']){
  const entry=manifest.files.find(x=>x.path===path);if(!entry)throw Error('Critical source missing in manifest '+path)
  const response=execFileSync('curl',['-ksS','--max-time','15',app+'/'+path.slice('apps/web/'.length)+'?raw'],{encoding:'utf8',timeout:17000,maxBuffer:4*1024*1024})
  const encoded=response.match(/export default ("(?:[^"\\]|\\.)*")/);if(!encoded)throw Error('Raw HTTP source response invalid '+path)
  const hash=crypto.createHash('sha256').update(JSON.parse(encoded[1])).digest('hex');report.httpPassport.push({path,sha256:hash,expected:entry.sha256})
  if(hash!==entry.sha256)throw Error('Actual HTTP source SHA differs '+path)
 }
 report.ramStart=memory();if(report.ramStart<500)throw Error('RAM below500MiB');save()
 const before=await(await fetch(base+'/json/list')).json(),ids=new Set(before.map(x=>x.id)),url=app+'/create?qaNativeOwned='+Date.now()
 execFileSync('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',url,'-p','com.android.chrome'],{encoding:'utf8',timeout:15000})
 for(let n=0;n<40&&!target;n++){const tabs=await(await fetch(base+'/json/list')).json();target=tabs.find(x=>!ids.has(x.id)&&x.url===url);if(!target)await new Promise(r=>setTimeout(r,250))}
 if(!target?.id)throw Error('ADB created no demonstrably new own target; user tabs preserved')
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});ws.on('message',raw=>{const x=JSON.parse(raw),p=pending.get(x.id);if(p){pending.delete(x.id);clearTimeout(p.timer);x.error?p.reject(Error(x.error.message)):p.resolve(x.result)}else if(x.method==='Runtime.exceptionThrown'){report.errors.push(x.params.exceptionDetails.exception?.description??x.params.exceptionDetails.text);save()}})
 await send('Page.enable');await send('Runtime.enable');await send('Page.bringToFront')
 monitor=setInterval(()=>{try{report.ram=memory();if(report.ram<500){report.memoryAbort=true;save();void fetch(base+'/json/close/'+target.id)}}catch(e){report.memoryError=String(e);save()}},10000)
 await wait(()=>!!document.querySelector('form input[type=text]'))
 await evaluate(()=>{const input=document.querySelector('form input[type=text]'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'728 native actual Room '+Date.now());input.dispatchEvent(new Event('input',{bubbles:true}));const a4=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='A4');if(a4)a4.click()})
 await evaluate(()=>document.querySelector('form button[type=submit]').click())
 await wait(()=>location.pathname.startsWith('/room/')&&!!window.__engine)
 report.created=await census();save();const room=await evaluate('location.origin+location.pathname')
 report.stage='native-init';save();await send('Page.navigate',{url:room+'?wcNative=1'})
 await wait(()=>!!window.__engine)
 const secure=await census();if(!secure.secure||!secure.gpu){report.unsupported=secure;throw Error('Native WebGPU requires actual secure origin and navigator.gpu')}
 await evaluate(async()=>{await window.__engine.paperReady();return true});await idle();await wait(()=>!window.__engine._locked&&window.__roomStore?.getState().userId!=='local')
 report.stage='pigment-live';save();await stroke('normal:100:100:PB29:round',[[300,300],[320,300],[340,300],[360,300]])
 let shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/pigment.png',Buffer.from(shot.data,'base64'))
 report.stage='water-live';save();await stroke('normal:0:100:PB29:round',[[300,420],[325,420],[350,420],[375,420]])
 report.stage='pigment-in-water';save();await stroke('normal:100:100:PB29:round',[[340,420],[341,420]])
 shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/water-pigment.png',Buffer.from(shot.data,'base64'))
 report.complete=true;report.stage='complete';save()
}catch(e){report.error=String(e);report.stage='failed';save();process.exitCode=1;try{if(ws?.readyState===1){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/failure.png',Buffer.from(shot.data,'base64'))}}catch{}}
finally{clearInterval(monitor);ws?.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Own tab closed'))}pending.clear();if(target?.id)await fetch(base+'/json/close/'+target.id);console.log(JSON.stringify({out,stage:report.stage,error:report.error,complete:report.complete}))}
