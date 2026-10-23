import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{execFileSync}from'node:child_process';import{createRequire}from'node:module';
const root='/home/suselman/projects/pencil-agents/728-bounded-ui-optin',resource='/home/suselman/.cache/codex-qa/native-private-copy-5a',out=root+'/temp/device-runs/native-private-copy-one-20261009.json',origin='https://10.203.72.1:5380';
const{chromium}=createRequire(root+'/package.json')('playwright');const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const paths=['webgpuCanonical/privatePublicationProbe.ts','webgpuCanonical/privatePublicationFactory.ts','webgpuCanonical/roomTileBridge.ts','webgpuCanonical/exactPipelinePreparation.ts','webgpuCanonical/publicationCost.ts','buffers/AccumulationBuffer.ts'].map(x=>'/src/engine/src/'+x);
const report={stage:'preflight',valid:false,errors:[],memory:[],sourceHEAD:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source:{},served:{}};
function save(){const text=JSON.stringify(report,null,2);fs.writeFileSync(out+'.tmp',text);fs.renameSync(out+'.tmp',out)}
function memory(){const raw=execFileSync('ssh',['surface','powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"'],{encoding:'utf8',timeout:10000}).trim();if(!/^\d+$/.test(raw))throw Error('Actual RAM invalid');const MiB=Number(raw)/1024;report.memory.push({at:Date.now(),stage:report.stage,MiB});save();return MiB}
let browser,context,timer,hard;
try{
 for(const p of paths){const source=fs.readFileSync(root+'/apps/web'+p),served=execFileSync('curl',['-ksf','https://127.0.0.1:5380'+p],{maxBuffer:2000000});report.source[p]={sha256:hash(source),bytes:source.length};report.served[p]={sha256:hash(served),bytes:served.length}}
 save();const admission=Date.now();while(memory()<1700){if(Date.now()-admission>=30000)throw Error('RAM admission HOLD');await new Promise(r=>setTimeout(r,1000))}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9455');context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>{if(report.errors.length<16)report.errors.push(String(e).slice(0,2000))});
 await page.goto(origin+'/@vite/client',{waitUntil:'domcontentloaded',timeout:30000});report.stage='source-before-GPU';save();
 const served=await page.evaluate(async(paths)=>{const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');const out={};for(const p of paths){const r=await fetch(p);if(!r.ok)throw Error('HTTP source '+p);const b=await r.arrayBuffer();out[p]={sha256:await sha(b),bytes:b.byteLength}}return out},paths);
 for(const p of paths)if(JSON.stringify(served[p])!==JSON.stringify(report.served[p]))throw Error('Browser served SHA mismatch '+p);report.browserServed=served;save();
 report.stage='ONE-standalone-GPU';save();timer=setInterval(()=>{try{if(memory()<500){report.abort='RAM below500';save();void context.close()}}catch(e){report.abort=String(e);save();void context.close()}},3000);
 const work=page.evaluate(async()=>{
  const {runPrivatePublicationProbe}=await import('/src/engine/src/webgpuCanonical/privatePublicationProbe.ts');const{canonicalRawCanvasRecipe}=await import('/src/engine/src/webgpuCanonical/roomTileBridge.ts');
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No actual adapter');const device=await adapter.requestDevice(),errors=[];let ownDestroy=false,lost=null;
  device.addEventListener('uncapturederror',e=>{if(errors.length<16)errors.push(e.error.message)});device.lost.then(x=>{if(!ownDestroy)lost={reason:x.reason,message:x.message}});
  try{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const gl=canvas.getContext('webgl');if(!gl)throw Error('No owned GL');
   const result=await runPrivatePublicationProbe(device,gl,()=>document.createElement('canvas'));const shader=new TextEncoder().encode(canonicalRawCanvasRecipe().code),shaderSHA=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',shader))).map(x=>x.toString(16).padStart(2,'0')).join('');
   return{...result,shaderSHA,shaderBytes:shader.length,errors,lost,glLost:gl.isContextLost(),deviceFeatures:[...device.features],ownPageOnly:true}
  }finally{ownDestroy=true;device.destroy()}
 });
 report.result=await Promise.race([work,new Promise((_,reject)=>{hard=setTimeout(()=>reject(Error('Hard120 deadline')),120000)})]);save();
 if(!report.result.exact||report.result.errors.length||report.result.lost||report.result.glLost||report.errors.length)throw Error('Standalone exact output gate failed');
 for(const p of paths)if(hash(fs.readFileSync(root+'/apps/web'+p))!==report.source[p].sha256)throw Error('Source changed during ONE');report.valid=true;report.stage='complete';save();
}catch(e){report.error=String(e);report.stage='failed';save();process.exitCode=1}
finally{clearInterval(timer);clearTimeout(hard);if(context)await context.close().catch(e=>{report.cleanupError=String(e)});browser?._connection.close();try{report.afterCloseFreeMiB=memory()}catch(e){report.cleanupMemoryError=String(e)}save();console.log(JSON.stringify({out,valid:report.valid,error:report.error,afterCloseFreeMiB:report.afterCloseFreeMiB}))}
