import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
if(process.env.DISPLAY_GPU_SLOT!=='granted')throw Error('Root GPU grant required');
const out='temp/profile-current/load-results';mkdirSync(out,{recursive:true});
const report={source:'f5397918',runs:[],limitations:['Synthetic pen through actual PointerInput, not physical stylus','CPU sampling perturbs timings; control measured separately']};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
const files=['apps/web/src/engine/index.ts','apps/web/src/engine/src/raster/shaders.ts','apps/web/scripts/devices/pageLib.js'];
report.sourceHashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));save();
let browser;const deadline=setTimeout(()=>browser?.close(),900000);try{
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'}});
 for(const spec of [{name:'dense',size:80,legs:8,legMs:150}])for(const sampled of [false]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000},deviceScaleFactor:1});let cdp;
  try{const page=await context.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>{(report.errors??=[]).push(String(e));save()});
   await page.goto('https://127.0.0.1:5314/create');await page.locator('form input[type=text]').first().fill('Profiler '+spec.name);await page.getByRole('button',{name:/Fine/}).first().click();await page.locator('form button[type=submit]').click();await page.waitForURL(/\/room\//);
   await page.waitForFunction(()=>window.__engine&&window.__roomStore&&!window.__engine.gl.isContextLost());await page.evaluate(()=>__engine.paperReady());
   await page.evaluate(async()=>{__roomStore.getState().setTool('watercolor');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)});
   const initial=await page.evaluate(()=>{const e=__engine,g=e.gl,d=g.getExtension('WEBGL_debug_renderer_info');return{room:location.pathname,locked:e._locked,paperLoaded:e._paper.loaded,debug:e._debug,renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'',ops:e._log.entries.length,page:e._pageSize(),timeOrigin:performance.timeOrigin}});
   if(initial.locked||!initial.paperLoaded||initial.debug||!/AMD|Vega|Radeon/.test(initial.renderer))throw Error('Source/foreground/input GPU guard');
   await page.evaluate(readFileSync('temp/profile-current/pageBench.js','utf8'));await page.evaluate(()=>{window.__profileGestureIds=[];const p=__engine._pointer,old=p._handleDown;p._handleDown=function(...a){const result=old.apply(this,a);if(!__engine._strokeId)throw Error('Pointerdown no native stroke');__profileGestureIds.push(__engine._strokeId);return result}});
   if(sampled){cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');}
   await page.evaluate(readFileSync('temp/profile-current/queueProbe.js','utf8'));
   await page.exposeFunction('__loadProgress',value=>{report.progress??=[];report.progress.push(value);save();console.log(JSON.stringify(value))});
   const input=JSON.parse(readFileSync('temp/profile-current/room-ops.json'));report.journalHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');save();
   const result=await page.evaluate(async input=>{const e=__engine,t=performance.now();let samples=[],final=null;const snap=()=>({elapsed:performance.now()-t,log:e._log.entries.length,pending:e._opQueue.length,settle:e._settle?{next:e._settle.next,total:e._settle.ops.length}:null,rebuild:e._rebuildJobs.size,reveals:e._washReveals.size});
    const timer=setInterval(()=>{const x=snap();samples.push(x);__loadProgress(x)},5000);
    try{for(const op of input)e.appendOperation(op,'remote');while(performance.now()-t<180000){if(!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size){final=snap();break}await new Promise(r=>setTimeout(r,100))}return{completed:!!final,elapsed:performance.now()-t,final:final??snap(),samples,gl:{error:e.gl.getError(),lost:e.gl.isContextLost()}}}finally{clearInterval(timer)}},input);
   const queueProfile=await page.evaluate(()=>__queueProbeFinish());report.queueProfile=queueProfile;report.result=result;save();
   if(result.gl.error||result.gl.lost)throw Error('Room load GL guard');
   if(result.completed){const png=await page.evaluate(async()=>{const b=await __engine.exportPNG();return await new Promise(r=>{const f=new FileReader;f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)})});writeFileSync(out+'/room.png',Buffer.from(png,'base64'));}
   console.log(JSON.stringify({completed:result.completed,elapsed:result.elapsed,jobs:queueProfile.jobs.length}));
  }finally{if(cdp)await cdp.send('Profiler.stop').catch(()=>{});await context.close()}
 }
}catch(e){report.error=String(e);save();throw e}finally{clearTimeout(deadline);await browser?.close();report.closed=true;save()}
