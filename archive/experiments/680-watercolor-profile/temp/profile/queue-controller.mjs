import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
if(process.env.DISPLAY_GPU_SLOT!=='granted')throw Error('Root GPU grant required');
const out='temp/profile-current/queue-results';mkdirSync(out,{recursive:true});
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
   await page.evaluate(readFileSync('temp/profile-current/queueProbe.js','utf8'));const result=await page.evaluate(spec=>{performance.mark('watercolor-profile-start-'+spec.name);return __nativePerf({...spec,scenario:'densezigzag',perFrame:2,tailLimitMs:90000,stamp:'f5397918',idleBatch:false}).finally(()=>performance.mark('watercolor-profile-end-'+spec.name))},spec);
   const queueProfile=await page.evaluate(()=>__queueProbeFinish());report.queueProfile=queueProfile;save();const nativeIds=await page.evaluate(()=>__profileGestureIds);const entries=await page.evaluate(()=>__engine._log.entries.map(e=>({id:e.op.id,type:e.op.type,strokeId:e.op.strokeId,seq:e.serverSeq,pending:e.pending})));
   report.guardCandidate={spec,sampled,initial,result,entries};save();const strokes=entries.filter(e=>e.type==='stroke');if(!strokes.length||!nativeIds.length||!nativeIds.every(id=>strokes.some(e=>e.strokeId===id))||strokes.some(e=>e.seq==null||e.pending)||result.gl.error||result.gl.lost||!result.settling.completed||result.draws===0)throw Error('Actual non-noop native ACK/GL guard');
   if(sampled){const {profile}=await cdp.send('Profiler.stop');writeFileSync(out+'/'+spec.name+'.cpuprofile',JSON.stringify(profile));await cdp.send('Profiler.disable');}
   report.runs.push({spec,sampled,initial,result,entries});save();console.log(JSON.stringify({spec:spec.name,sampled,active:result.frameStats.active,settle:result.settling,ops:strokes.length}));
  }finally{if(cdp)await cdp.send('Profiler.stop').catch(()=>{});await context.close()}
 }
}catch(e){report.error=String(e);save();throw e}finally{clearTimeout(deadline);await browser?.close();report.closed=true;save()}
