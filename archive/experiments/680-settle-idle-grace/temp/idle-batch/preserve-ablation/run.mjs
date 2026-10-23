import {startBoundedTrace} from './boundedTrace.mjs'
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
if(process.env.PERF_GPU_SLOT!=='granted')throw Error('Explicit root GPU grant required')
if(!process.env.APP_URL)throw Error('APP_URL of verified release runtime required')
const here=dirname(fileURLToPath(import.meta.url)),out=resolve(process.argv[2]||here+'/results');mkdirSync(out,{recursive:true})
const manifest=process.env.PERF_SOURCE_MANIFEST?JSON.parse(readFileSync(process.env.PERF_SOURCE_MANIFEST,'utf8')):null
const stamp=manifest?.sourceCommit||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
if(process.env.PERF_EXPECTED_SHA&&!stamp.startsWith(process.env.PERF_EXPECTED_SHA))throw Error('Source stamp mismatch')
if(manifest){const {createHash}=await import('node:crypto');for(const [file,hash]of Object.entries(manifest.files)){const actual=createHash('sha256').update(readFileSync(resolve(process.env.PERF_SOURCE_ROOT||process.cwd(),file))).digest('hex');if(actual!==hash)throw Error('Manifest file mismatch: '+file)}}
const {chromium}=createRequire(process.env.PERF_NODE_REQUIRE||process.cwd()+'/package.json')('playwright')
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors','--window-position=0,0']})
const code=readFileSync(here+'/pageBench.js','utf8');let page,watchdog,cdpTrace;const allErrors=[];
const memoryMonitor=setInterval(()=>{
  const info=Object.fromEntries(readFileSync('/proc/meminfo','utf8').split('\n').filter(x=>/^(MemAvailable|SwapFree):/.test(x)).map(x=>[x.split(':')[0],Number(x.trim().split(/\s+/)[1])]));
  appendFileSync(out+'/system-memory.jsonl',JSON.stringify({at:new Date().toISOString(),...info})+'\n');
  if(info.MemAvailable<300*1024){writeFileSync(out+'/resource-stop.json',JSON.stringify({reason:'MemAvailable below300MiB; not a performance conclusion',...info}));browser.close().catch(()=>{});}
},1000);
try{
 const rootOut=out;
 for(const [label,mode] of (process.env.PERF_SCREEN_SEQUENCE==='1'?[['pair1-off',false],['pair1-on',true],['pair2-on',true],['pair2-off',false]]:[['single',process.env.PERF_SCREEN_NOOP==='1']])){
 const out=process.env.PERF_SCREEN_SEQUENCE==='1'?resolve(rootOut+'/'+label):rootOut;mkdirSync(out,{recursive:true});
 for(const scenario of (process.env.PERF_SCENARIOS||'densezigzag,purewater,waterthenpigment').split(',')){
  watchdog=setTimeout(()=>browser.close().catch(()=>{}),120000)
  const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000},deviceScaleFactor:1});await ctx.addInitScript({path:here+'/contextRegistry.js'});await ctx.addInitScript({content:'window.__preserveOverride='+JSON.stringify(mode)+';'});page=await ctx.newPage();const errors=[],warnings=[]
  page.on('pageerror',e=>{errors.push(e.message);allErrors.push({scenario,message:e.message,stack:e.stack,at:new Date().toISOString()});writeFileSync(out+'/errors.json',JSON.stringify(allErrors,null,2));console.log('PAGEERROR '+e.message)});page.on('console',m=>{if(/WebGL|GL_|context lost/i.test(m.text()))warnings.push(m.text())})
  const phase=(name,extra={})=>{const p={scenario,stage:name,at:new Date().toISOString(),...extra};writeFileSync(out+'/'+scenario+'.phase.json',JSON.stringify(p));console.log(JSON.stringify(p))}
  phase('create');await page.goto(process.env.APP_URL+'/create');await page.waitForTimeout(2500)
  await page.locator('input[type="text"]').first().fill('native performance QA')
  await page.getByRole('button',{name:/Medium/}).first().click();const a2=page.getByText('A2',{exact:true}).first();await a2.click();await a2.click()
  await page.getByRole('button',{name:/Create project|Создать проект/}).click();await page.waitForURL(/\/room\/[^/]+$/)
  await page.waitForFunction(()=>!!window.__engine);await page.waitForTimeout(1500);await page.evaluate(readFileSync(here+'/glCallTrace.js','utf8'));await page.evaluate(code);await page.evaluate(readFileSync(here+'/pickProbe.js','utf8'))
  await page.exposeFunction('__perfEvent',event=>appendFileSync(out+'/'+scenario+'.events.jsonl',JSON.stringify({nodeAt:new Date().toISOString(),...event})+'\n'));
  if(process.env.PERF_CDP_TRACE==='1'){if(process.env.PERF_IDLE_BATCH==='1')throw Error('Causaltrace requires baselineOFF');cdpTrace=await startBoundedTrace(browser,page,out)}
  phase('bench');const result=await page.evaluate(async config=>await window.__nativePerf(config),{scenario,size:+(process.env.PERF_SIZE||80),legs:+(process.env.PERF_LEGS||8),legMs:scenario==='burst'?150:300,perFrame:2,tailLimitMs:45000,stamp,idleBatch:process.env.PERF_IDLE_BATCH==='1',glCallTrace:process.env.PERF_GL_CALL_TRACE==='1',screenNoop:false})
  const expected={diagnosticSegmentDelivery:'combined',diagnosticPigmentRecord:true,diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticSolventField:true,diagnosticCanonicalSettleRadius:true,diagnosticLandingPolicy:'fluid',diagnosticWaterPolicy:'bottomless',diagnosticForeignSolvent:true};
  for(const [key,value]of Object.entries(expected))if(result.passport.flags[key]!==value)throw Error('Runtimeflag mismatch:'+key);
  if(!/AMD|Radeon|Vega/i.test(result.passport.renderer)||/SwiftShader|llvmpipe/i.test(result.passport.renderer))throw Error('ActualVega required');
  if(process.env.PERF_GL_CALL_TRACE==='1'&&(!result.glCallTraceReport||result.glCallTraceReport.errors.length))throw Error('Trace observer failed');
  result.errors=errors;result.warnings=warnings;result.finished=new Date().toISOString();result.room=page.url().split('/').pop();writeFileSync(out+'/'+scenario+'.json',JSON.stringify(result,null,2))
  if(!result.settling.completed)throw Error('Bounded native settle/reveal did not become idle within45s; metrics saved')
  // Screenshot and optional canonical export occur AFTER all timing observers
  // have stopped. Their stalls are reported separately, never as pen latency.
  await page.screenshot({path:out+'/'+scenario+'.png',timeout:5000})
  if(cdpTrace){await cdpTrace.close();cdpTrace=null}
  phase('post-timing-control');const pickProbe=await page.evaluate(()=>window.__preservePickProbe());writeFileSync(out+'/'+scenario+'.pick.json',JSON.stringify(pickProbe,null,2));await page.evaluate(()=>window.__engine._display());const control=await page.evaluate(async()=>{
    const e=window.__engine,start=performance.now(),blob=await e.exportPNG(true);if(!blob)throw Error('Transparent stroke export returned null');const bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.drawImage(bitmap,0,0,256,256);bitmap.close();const px=g.getImageData(0,0,256,256).data;let nonzeroAlpha=0,maxAlpha=0;for(let i=3;i<px.length;i+=4){if(px[i]>0)nonzeroAlpha++;maxAlpha=Math.max(maxAlpha,px[i]);}
    const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return{contextOverride:window.__webglContextRegistry?.report(),operations:e.getOperations(),exportWallMs:performance.now()-start,nonzeroAlpha,maxAlpha,png:btoa(text),strokeOps:e.getOperations().filter(o=>o.type==='stroke').length,washIds:[...new Set(e.getOperations().filter(o=>o.type==='stroke').map(o=>o.washId))],strokeSources:e.getOperations().filter(o=>o.type==='stroke').map(o=>({preset:o.preset,washId:o.washId,wetContacts:o.wet?.replace(/0/g,'').length||0})),sourceLost:e.gl.isContextLost()};
  });writeFileSync(out+'/'+scenario+'.canonical.png',Buffer.from(control.png,'base64'));delete control.png;writeFileSync(out+'/'+scenario+'.operations.json',JSON.stringify(control.operations));delete control.operations;result.postTimingControl=control;
  const peakWet=Math.max(0,...result.samples.map(s=>s.memory.wetCells||0));
  if(!control.strokeOps||control.sourceLost||(scenario==='purewater'?peakWet===0:control.nonzeroAlpha===0))throw Error('No-op/clipped native benchmark control failed');
  writeFileSync(out+'/'+scenario+'.json',JSON.stringify(result,null,2));
  if(errors.length||result.gl.lost||result.gl.error)throw Error('Native performance fixture GL/UI failure')
  phase('finished',{gl:result.gl,settling:result.settling,draws:result.draws,longtasks:result.longTasksOver200.length})
  await page.evaluate(()=>window.__restorePreservePick());await ctx.close();clearTimeout(watchdog)
 }
 }
}catch(error){writeFileSync(out+'/runner-error.json',JSON.stringify({message:String(error),stack:error?.stack,at:new Date().toISOString(),pageErrors:allErrors},null,2));throw error}finally{if(cdpTrace)await cdpTrace.close().catch(error=>writeFileSync(out+'/trace-error.json',JSON.stringify({message:String(error)})));clearInterval(memoryMonitor);clearTimeout(watchdog);await browser.close();console.log('OWNED_CHROME_CLOSED')}
