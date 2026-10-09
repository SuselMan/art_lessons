import fs from'node:fs';import path from'node:path';import{createRequire}from'node:module';import{createHash}from'node:crypto';
import{OwnedCdpCohort}from'../728-room-moment/OwnedCdpCohort.mjs';import{waitForFreshMemory}from'../728-room-moment/PassiveMemoryGate.mjs';import{readSurfaceMemoryAsync}from'../728-room-moment/SurfaceMemoryAsync.mjs';
const out=process.env.GATE_OUT,origin=process.env.QA_ROOM_BASE,source=process.env.QA_SOURCE_DIR,paperDir=process.env.QA_PAPER_DIR,endpoint=process.env.QA_CDP_URL;
if(!out||!origin||!source||!paperDir||!endpoint||fs.existsSync(out)||process.env.QA_WET_ALLOCATED!=='1')throw Error('Explicit allocated isolated probe/new output required');
const base=new URL(origin);if(base.protocol!=='https:'||base.pathname!=='/')throw Error('Trusted HTTPS origin required');
const files=['apps/web/src/engine/index.ts','apps/web/src/engine/src/paper/paperWetness.ts','apps/web/src/engine/src/paper/WetTranscript.ts','apps/web/src/engine/src/input/PointerInput.ts','docs/qa/harness/728-gl-timing/WetReplayQuality.mjs','docs/qa/harness/728-gl-timing/wet-replay-surface-controller.mjs'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),passport={source:[],paper:[]};
// Complete disk/served critical source bytes before any context/input.
for(const file of files){const bytes=fs.readFileSync(path.join(source,file)),url=new URL('/@fs/'+path.join(source,file)+'?raw&import',origin).href,response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Source HTTP');const m=(await response.text()).match(/export default ("(?:[^"\\]|\\.)*")/s);if(!m||!Buffer.from(JSON.parse(m[1])).equals(bytes))throw Error('Source authority mismatch');const transformed=await fetch(new URL('/@fs/'+path.join(source,file),origin),{signal:AbortSignal.timeout(10000)});if(!transformed.ok)throw Error('Transformed source HTTP');passport.source.push({file,sha:sha(bytes),servedSHA:sha(Buffer.from(await transformed.arrayBuffer()))})}
const paperManifest=JSON.parse(fs.readFileSync(path.join(paperDir,'manifest.json'),'utf8')),fine=paperManifest.assets?.fine;
if(paperManifest.version!==2||!fine)throw Error('Fine paper manifest required');
for(const file of ['manifest.json',fine.texture,fine.preview]){if(typeof file!=='string'||path.basename(file)!==file)throw Error('Paper path');const bytes=fs.readFileSync(path.join(paperDir,file));if(bytes.length>8*1024*1024)throw Error('Paper bound');const r=await fetch(new URL('/paper/'+file,origin),{signal:AbortSignal.timeout(10000)});if(!r.ok||!Buffer.from(await r.arrayBuffer()).equals(bytes))throw Error('Paper bytes mismatch');passport.paper.push({file,sha:sha(bytes)})}

const require=createRequire(new URL('../../../../package.json',import.meta.url)),{chromium}=require('playwright'),owned=new OwnedCdpCohort(()=>chromium.connectOverCDP(endpoint));
let page,context,timer,probe,probing=false,aborted=false,result;const stages=[],memory=[],errors=[],partials=[];
const save=()=>fs.writeFileSync(out,JSON.stringify({scope:'Isolated Surface actual GL endpoint quality only; no Room/manual/latency/foreign wash',passport,stages,memory,errors,partials,result},null,2));
const stage=name=>{stages.push({name,at:performance.now()});save()};
const abort=reason=>{aborted=true;errors.push(reason);save();owned.close().catch(()=>{})};
const fresh=()=>waitForFreshMemory(()=>readSurfaceMemoryAsync(),{threshold:1700,maxWaitMs:30000,onObserve:m=>{memory.push(m);save()}});
try{
 await fresh();if(aborted)throw Error('Aborted before context');context=await owned.open({viewport:{width:300,height:300}});page=await context.newPage();timer=setTimeout(()=>abort('Hard120'),120000);
 probe=setInterval(async()=>{if(probing||aborted)return;probing=true;try{const free=await readSurfaceMemoryAsync();memory.push({phase:'active',free});if(free<500)abort('RAM500')}catch{abort('RAM probe failed')}finally{probing=false}},2500);
 page.on('pageerror',e=>{errors.push(String(e));save()});const url=new URL('/__qa-isolated-wet-replay',origin).href;
 await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"></body></html>'}));
 await page.exposeFunction('__qaWetBeforeArm',async replay=>{stage(replay?'replay-admission':'baseline-admission');await fresh();if(aborted)throw Error('Aborted arm')});
 await page.exposeFunction('__qaWetPartial',value=>{if(value.image){const {replay,dataURL}=value.image;if(!/^data:image\/png;base64,/.test(dataURL)||dataURL.length>2*1024*1024)throw Error('Bounded PNG required');const file=out+(replay?'.replay.png':'.baseline.png');fs.writeFileSync(file,Buffer.from(dataURL.split(',')[1],'base64'));partials.push({image:{replay,file}})}else partials.push(value);if(partials.length>16)throw Error('Partial cap');save()});
 stage('goto-isolated-document');await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});
 result=await page.evaluate(async({source,origin,passport})=>{
  const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join(''),url=file=>origin+'/@fs/'+source+'/'+file,browser={source:[],paper:[]};
  for(const item of passport.source){const raw=await import(url(item.file)+'?raw&import'),sha=await hash(new TextEncoder().encode(raw.default));if(sha!==item.sha)throw Error('Browser source SHA mismatch');const transformed=await fetch(url(item.file));if(!transformed.ok)throw Error('Browser transformed HTTP');const servedSHA=await hash(await transformed.arrayBuffer());if(servedSHA!==item.servedSHA)throw Error('Browser transformed SHA mismatch');browser.source.push({file:item.file,sha,servedSHA})}
  for(const item of passport.paper){const r=await fetch(origin+'/paper/'+item.file);if(!r.ok)throw Error('Browser paper HTTP');const sha=await hash(await r.arrayBuffer());if(sha!==item.sha)throw Error('Browser paper SHA mismatch');browser.paper.push({file:item.file,sha})}
  await window.__qaWetPartial({browserPassport:browser});
  const {wetReplayQuality}=await import(url('docs/qa/harness/728-gl-timing/WetReplayQuality.mjs'));return wetReplayQuality({engineUrl:url('apps/web/src/engine/index.ts'),transcriptUrl:url('apps/web/src/engine/src/paper/WetTranscript.ts'),onPartial:v=>window.__qaWetPartial(v),onBeforeArm:replay=>window.__qaWetBeforeArm(replay)})
 },{source,origin:base.origin,passport});
 result.valid=Boolean(result.valid&&!aborted&&!errors.length);stage('outcome');
}catch(e){result={valid:false,error:String(e)};save()}finally{clearTimeout(timer);clearInterval(probe);save();await Promise.race([owned.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);owned.browser?._connection.close();stage('closed');console.log(JSON.stringify({out,valid:result?.valid}));process.exit(result?.valid?0:1)}
