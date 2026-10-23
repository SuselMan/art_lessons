import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
if(process.env.DISPLAY_GPU_SLOT!=='granted')throw Error('Root GPU grant required');
const out='temp/contact-budget/results';mkdirSync(out,{recursive:true});
const report={source:'7f70969d',runs:[],limitations:['Synthetic pen through actual PointerInput, not physical stylus','CPU sampling perturbs timings; control measured separately']};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
const files=['apps/web/src/engine/index.ts','apps/web/src/engine/src/raster/shaders.ts','apps/web/scripts/devices/pageLib.js'];
report.sourceHashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));save();
let recordedOp=null;let browser;const deadline=setTimeout(()=>browser?.close(),900000);try{
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'}});
 for(const spec of [{name:'capture',size:80,legs:8,legMs:150},{name:'replay',size:80,legs:8,legMs:150},{name:'batch4',size:80,legs:8,legMs:150}])for(const sampled of [false]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000},deviceScaleFactor:1});let cdp;
  try{const page=await context.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>{(report.errors??=[]).push(String(e));save()});
   await page.goto('https://127.0.0.1:5311/create');await page.locator('form input[type=text]').first().fill('Profiler '+spec.name);await page.getByRole('button',{name:/Fine/}).first().click();await page.locator('form button[type=submit]').click();await page.waitForURL(/\/room\//);
   await page.waitForFunction(()=>window.__engine&&window.__roomStore&&!window.__engine.gl.isContextLost());await page.evaluate(()=>__engine.paperReady());
   await page.evaluate(async()=>{__roomStore.getState().setTool('watercolor');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)});
   const initial=await page.evaluate(()=>{const e=__engine,g=e.gl,d=g.getExtension('WEBGL_debug_renderer_info');return{room:location.pathname,locked:e._locked,paperLoaded:e._paper.loaded,debug:e._debug,renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'',ops:e._log.entries.length,page:e._pageSize(),timeOrigin:performance.timeOrigin}});
   if(initial.locked||!initial.paperLoaded||initial.debug||!/AMD|Vega|Radeon/.test(initial.renderer))throw Error('Source/foreground/input GPU guard');
   await page.evaluate(readFileSync('temp/contact-budget/pageBench.js','utf8'));await page.evaluate(()=>{window.__profileGestureIds=[];const p=__engine._pointer,old=p._handleDown;p._handleDown=function(...a){const result=old.apply(this,a);if(!__engine._strokeId)throw Error('Pointerdown no native stroke');__profileGestureIds.push(__engine._strokeId);return result}});
   if(sampled){cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');}
   let result;
   if(spec.name==='capture'){
    result=await page.evaluate(spec=>__nativePerf({...spec,scenario:'densezigzag',perFrame:2,tailLimitMs:90000,stamp:'7f70969d',idleBatch:false}),spec);
    recordedOp=await page.evaluate(()=>JSON.parse(JSON.stringify(__engine._log.entries.find(e=>e.op.type==='stroke').op)));writeFileSync(out+'/op.json',JSON.stringify(recordedOp));
   }else{
    result=await page.evaluate(async ({op,batch})=>{const e=__engine,q=e._settleQueue,old=q.start,groups=[];
     if(typeof q.contactBatchEnabled!=='boolean')throw Error('Candidate absent');q.contactBatchEnabled=batch;
     const t=performance.now();try{e.appendOperation(op,'remote');let solver=null;while(performance.now()-t<120000){if(!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size){solver??=performance.now()-t;if(!e._washReveals.size)break}await new Promise(r=>setTimeout(r,25))}return{wallMs:performance.now()-t,solverMs:solver,groups,gl:{error:e.gl.getError(),lost:e.gl.isContextLost()},settling:{completed:!e._settle&&!e._opQueue.length},draws:1}}finally{q.start=old}}, {op:recordedOp,batch:spec.name==='batch4'});
   }
   const png=await page.evaluate(async()=>{const b=await __engine.exportPNG();if(!b)throw Error('Missing PNG');return await new Promise(r=>{const f=new FileReader;f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)})});writeFileSync(out+'/'+spec.name+'.png',Buffer.from(png,'base64'));
   const nativeIds=await page.evaluate(()=>__profileGestureIds);const entries=await page.evaluate(()=>__engine._log.entries.map(e=>({id:e.op.id,type:e.op.type,strokeId:e.op.strokeId,seq:e.serverSeq,pending:e.pending})));
   report.guardCandidate={spec,sampled,initial,result,entries};save();const strokes=entries.filter(e=>e.type==='stroke');if(!strokes.length||(spec.name==='capture'&&(!nativeIds.length||!nativeIds.every(id=>strokes.some(e=>e.strokeId===id))))||(spec.name==='capture'&&strokes.some(e=>e.seq==null||e.pending))||result.gl.error||result.gl.lost||!result.settling.completed||result.draws===0)throw Error('Actual non-noop native ACK/GL guard');
   if(sampled){const {profile}=await cdp.send('Profiler.stop');writeFileSync(out+'/'+spec.name+'.cpuprofile',JSON.stringify(profile));await cdp.send('Profiler.disable');}
   report.runs.push({spec,sampled,initial,result,entries});save();console.log(JSON.stringify({spec:spec.name,sampled,active:result.frameStats?.active,settle:result.settling,ops:strokes.length}));
  }finally{if(cdp)await cdp.send('Profiler.stop').catch(()=>{});await context.close()}
 }
}catch(e){report.error=String(e);save();throw e}finally{clearTimeout(deadline);await browser?.close();report.closed=true;save()}
