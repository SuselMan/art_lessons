import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {remoteMemoryMiB} from '../728-joined-deferred/remote-device.mjs';import{decodeFactorPacket}from './factor-packet.mjs'
const require=createRequire(new URL('../../../../package.json',import.meta.url)),WebSocket=require('ws')
const base=process.env.CDP_BASE,url=process.env.GATE_URL,out=process.env.GATE_OUT
if(!base||!url||!out||new URL(base).hostname!=='127.0.0.1'||new URL(base).port!=='9455')throw Error('Explicit allocated Surface9455 CDP_BASE, GATE_URL, GATE_OUT required')
if(fs.existsSync(out))throw Error('Refuse to overwrite evidence');fs.mkdirSync(out,{recursive:true})
const report={stage:'preflight',memory:[],valid:false,error:null};let target,ws,seq=0,timer,closed=false;const pending=new Map()
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2))
const memory=()=>{const MiB=remoteMemoryMiB({file:'ssh',args:['surface','powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"']});report.memory.push({at:Date.now(),stage:report.stage,MiB});save();return MiB}
const close=async()=>{if(closed)return;closed=true;clearInterval(timer);ws?.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Owned target closed'))}pending.clear();if(target){await fetch(base+'/json/close/'+target.id);target=null}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Bounded CDP60s timeout '+method))},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
try{
 const files={};for(const name of ['run.js','index.html','manifest.json']){const r=await fetch(new URL(name,url));if(!r.ok)throw Error('HTTP '+name+' '+r.status);const b=Buffer.from(await r.arrayBuffer());files[name]={bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};if(name==='manifest.json'){const m=JSON.parse(b);for(const key of ['run.js','index.html'])if(m.files[key].sha256!==files[key].sha256||m.files[key].bytes!==files[key].bytes)throw Error('Immutable HTTP passport mismatch');report.passport=m}}report.http=files;save()
 if(memory()<1700)throw Error('RAM preflight below1700MiB')
 target=await(await fetch(base+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)})
 ws.on('message',raw=>{const x=JSON.parse(raw),p=pending.get(x.id);if(p){pending.delete(x.id);clearTimeout(p.timer);x.error?p.reject(Error(x.error.message)):p.resolve(x.result)}})
 await send('Runtime.enable');await send('Page.bringToFront');report.stage='one-factor-run';save()
 timer=setInterval(()=>{try{if(memory()<500){report.error='RAM abort below500MiB';save();void close()}}catch(e){report.error=String(e);save();void close()}},3000)
 const packet=await evaluate(`import(${JSON.stringify(new URL('run.js',url).href)}).then(m=>m.runHeldStampFactors())`)
 const decoded=decodeFactorPacket(packet);report.groups=[]
 for(const g of decoded){fs.writeFileSync(path.join(out,g.group+'.rgba'),g.bytes);report.groups.push({group:g.group,channels:g.channels,sha256:g.sha256,byteLength:g.bytes.length})}
 report.roi=packet.roi;report.scope=packet.scope;report.inputScope=packet.inputScope;report.errors=packet.errors;report.valid=true;report.stage='complete';save()
}catch(e){report.error=String(e);report.stage='failed';save();process.exitCode=1}
finally{await close();try{report.afterCloseFreeMiB=memory()}catch(e){report.cleanupMemoryError=String(e)}save();console.log(JSON.stringify({out,valid:report.valid,error:report.error,afterCloseFreeMiB:report.afterCloseFreeMiB}))}
