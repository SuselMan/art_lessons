// CPU-prepared only. Never run while another agent owns this device.
import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire('/home/suselman/projects/pencil-agents/680-device-qa-guards/package.json'),WebSocket=require('ws');
if(process.env.ROOT_GPU_GRANTED!=='1')throw Error('Explicit future exclusive GPU grant required');
const targetID=process.env.OWN_TARGET_ID,nonce=process.env.OWN_NONCE,app=process.env.APP_URL;
if(!targetID||!nonce||!app)throw Error('Exact already-created owned Room target required');
const base=process.env.CDP_URL??'http://127.0.0.1:9338',out='temp/pure-water-plan/causal-trace/run-'+Date.now();fs.mkdirSync(out,{recursive:true});
const target=(await(await fetch(base+'/json/list')).json()).find(t=>t.id===targetID);
if(!target||!target.url.startsWith(app+'/room/')||!target.url.includes(nonce))throw Error('Owned URL/id/nonce mismatch');
const report={targetID,url:target.url,scope:'read-only submit labels + external GPU trace; no physics ablation/no readback',closed:false};
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});let seq=0,traceFinished;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
socket.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}}else if(m.method==='Tracing.tracingComplete')traceFinished=m.params});
const ev=async(expression,awaitPromise=false)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value};
const save=()=>fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));let tracing=false;
const watchdog=setTimeout(()=>{report.watchdog=true;save();void fetch(base+'/json/close/'+targetID);socket.close()},180000);
try{
 await send('Runtime.enable');report.passport=await ev(`(()=>{const e=__engine;return{visible:document.visibilityState,loaded:e._paper.loaded,locked:e._locked,size:e._opts.size,preset:e._opts.pencilType,gpu:e.gpuInfo(),purePlan:e._settlePlan.diagnosticPureWaterPlan,async:e._wcAsyncFinish,rebase:e._wcSourceFilmRebase,zero:e._wcZeroPigmentContacts,queue:!!e._settleQueue.current,canonical:e._wcCanonical.pending}})()`);
 if(!report.passport.loaded||report.passport.locked||report.passport.visible!=='visible'||report.passport.size!==400||!report.passport.preset.startsWith('normal:100:0:')||report.passport.queue||report.passport.canonical)throw Error('Actual loaded idle purewater400 preconditions');
 const observer=fs.readFileSync('temp/pure-water-plan/causal-trace/observer.js','utf8');new Function('return '+observer);await ev(`window.__pureTailObserver=(${observer})(__engine);true`);
 await send('Tracing.start',{transferMode:'ReturnAsStream',traceConfig:{recordMode:'recordContinuously',includedCategories:['gpu','disabled-by-default-gpu.service','blink.user_timing','toplevel','devtools.timeline']}});tracing=true;
 await ev(`window.__tailResult=null;window.__tailError=null;__mt.stroke({pts:[[.2,.3],[.8,.35],[.2,.4],[.8,.45],[.2,.5],[.8,.55],[.2,.6],[.8,.65]],ms:3000,perFrame:2}).then(x=>__tailResult=JSON.parse(x)).catch(e=>__tailError=String(e));true`);
 const deadline=Date.now()+30000;while(Date.now()<deadline){if(await ev('Boolean(__tailResult||__tailError)'))break;await new Promise(r=>setTimeout(r,250))}
 report.input=await ev('__tailResult');report.inputError=await ev('__tailError');if(!report.input||report.inputError)throw Error('Native trace input failed');
 report.observer=await ev('__pureTailObserver.stop()');await send('Tracing.end');tracing=false;
 const end=Date.now()+20000;while(!traceFinished&&Date.now()<end)await new Promise(r=>setTimeout(r,100));if(!traceFinished?.stream)throw Error('Trace stream absent');
 const fd=fs.openSync(out+'/trace.json','w');try{while(true){const c=await send('IO.read',{handle:traceFinished.stream,size:65536});fs.writeSync(fd,c.base64Encoded?Buffer.from(c.data,'base64'):c.data);if(c.eof)break}}finally{fs.closeSync(fd);await send('IO.close',{handle:traceFinished.stream})}
 report.complete=true;
}catch(e){report.error=String(e)}finally{
 try{await ev('window.__pureTailObserver?.stop();true')}catch{}
 if(tracing)try{await send('Tracing.end')}catch{}
 clearTimeout(watchdog);socket.close();await fetch(base+'/json/close/'+targetID);report.closed=true;save();
}
console.log(JSON.stringify({out,complete:report.complete,error:report.error,closed:report.closed}));
