import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
const dir=process.env.WC_QA_OUT,base=process.env.WC_CDP_BASE,url=process.env.WC_STAGE_URL;
if(!dir||!base||!url||process.env.WC_GPU_SLOT!=='granted')throw Error('Explicit prepared directory/CDP/stage/GPU grant required');
const pass=JSON.parse(readFileSync(dir+'/passport.json')),probe=readFileSync(dir+'/probe.js','utf8'),input=JSON.parse(readFileSync(dir+'/input.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(probe)!==pass.probeSHA||hash(readFileSync(dir+'/current.mjs'))!==pass.bundleSHA)throw Error('Prepared source changed');
const served=new Uint8Array(await(await fetch(url+'/current.mjs')).arrayBuffer());if(hash(served)!==pass.bundleSHA)throw Error('Served bundle mismatch');
input.moduleURL=url+'/current.mjs';
const {default:WebSocket}=await import(createRequire(process.env.WC_RELEASE_ROOT+'/package.json').resolve('ws'));
const ram=()=>new Promise((r,j)=>execFile('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=8','surface','powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024, 1)"'],{timeout:12000},(e,v)=>e?j(e):Number.isFinite(Number(v.trim()))?r(Number(v.trim())):j(Error('RAM response'))));
let target,ws,n=0,ramTimer;const pending=new Map();const report={passport:pass,errors:[],scope:'standalone current42 endpoint only; no first-pass profile/Room/PASS'};
const save=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));
try{
 report.ramPreflightMiB=await ram();if(report.ramPreflightMiB<1700)throw Error('Surface RAM preflight');
 ramTimer=setInterval(async()=>{try{const v=await ram();report.ramMinimumMiB=Math.min(report.ramMinimumMiB??v,v);if(v<500&&target){report.ramAbort=true;save();await fetch(base+'/json/close/'+target.id)}}catch(e){report.ramMonitorError=String(e)}},10000);
 target=await(await fetch(base+'/json/new?'+encodeURIComponent(url+'/?ring-off='+Date.now()),{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 ws.on('message',data=>{const m=JSON.parse(String(data));if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(m.error):p.resolve(m.result)}});
 const call=(method,params)=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
 await call('Page.bringToFront',{});
 const result=await Promise.race([call('Runtime.evaluate',{expression:'('+probe+')('+JSON.stringify(input)+')',awaitPromise:true,returnByValue:true}),new Promise((_,j)=>setTimeout(()=>j(Error('Bounded900s timeout')),900000))]);
 if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
 report.result=result.result.value;
 for(const k of ['preDryPNG','finalPNG','transparentPNG'])if(report.result[k]){writeFileSync(dir+'/'+k+'.png',Buffer.from(report.result[k],'base64'));report.result[k]={file:k+'.png'}}
 report.completed=!!(report.result.completed&&report.result.engineClosed&&!report.result.gpu.gl&&!report.result.gpu.lost);if(!report.completed)throw Error('Endpoint incomplete');
}catch(e){report.error=String(e);process.exitCode=1}
finally{clearInterval(ramTimer);ws?.close();if(target){await fetch(base+'/json/close/'+target.id);report.ownedTargetClosed=true}save()}
console.log(JSON.stringify({completed:report.completed,error:report.error,closed:report.ownedTargetClosed}));process.exit(process.exitCode??0);
