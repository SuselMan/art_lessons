import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
if(process.env.DISPLAY_GPU_SLOT!=='granted')throw Error('Root GPU grant required');
const out='temp/contact-budget/load-results';mkdirSync(out,{recursive:true});
const input=JSON.parse(readFileSync('../680-combined-stability/temp/profile-current/room-ops.json'));
const report={source:'6f0fba84',journalHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),journalCount:input.length,runs:[]};
if(report.journalCount!==47||report.journalHash!=='d242bf844577fb0a6cc016e88da468e2738f64be5df6241d9d2aa9d06f6dd552')throw Error('Immutable journal guard');
report.sourceHashes=Object.fromEntries(['apps/web/src/engine/index.ts','apps/web/src/engine/src/raster/shaders.ts','apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts','apps/web/src/engine/src/raster/WatercolorSettlePlan.ts'].map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));save();
let browser;const deadline=setTimeout(()=>browser?.close(),650000);
try{
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'}});
 for(const batch of [false,true]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000},deviceScaleFactor:1});
  try{
   const page=await context.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>{(report.errors??=[]).push(String(e));save()});
   await page.goto('https://127.0.0.1:5311/create');await page.locator('form input[type=text]').first().fill('Fixed journal load '+batch);await page.getByRole('button',{name:/Fine/}).first().click();await page.locator('form button[type=submit]').click();await page.waitForURL(/\/room\//);
   await page.waitForFunction(()=>window.__engine&&window.__roomStore);await page.evaluate(()=>__engine.paperReady());
   const passport=await page.evaluate(()=>{const e=__engine,g=e.gl,d=g.getExtension('WEBGL_debug_renderer_info');return {renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'',page:e._pageSize(),paperColor:e._paper.color(),camera:e._camera.pose,paperLoaded:e._paper.loaded,debug:e._debug,visibility:document.visibilityState,gl:g.getError(),lost:g.isContextLost(),initialOps:e.getOperations().length}});
   if(passport.camera.angle!==0||Math.abs(passport.paperColor[0]-253/255)>1e-6||Math.abs(passport.paperColor[2]-252/255)>1e-6)throw Error('Fine original paper/camera metadata mismatch');
   if(passport.page.w!==1754||passport.page.h!==2480)throw Error('Fixed room metadata mismatch');
   if(!/AMD|Vega|Radeon/.test(passport.renderer)||passport.gl||passport.lost||!passport.paperLoaded||passport.debug||passport.visibility!=='visible')throw Error('Hardware passport');
   const run={batch,passport,progress:[]};report.runs.push(run);save();
   await page.exposeFunction('__loadProgress',x=>{run.progress.push(x);save();console.log(JSON.stringify({batch,...x}))});
   run.result=await page.evaluate(async ({input,batch})=>{
    const e=__engine,q=e._settleQueue;if(typeof q.contactBatchEnabled!=='boolean')throw Error('Candidate missing');q.contactBatchEnabled=batch;q.contactBatchMax=8;q.frontBatchEnabled=batch;
    const t=performance.now(),ticks=[],completeCalls=[],jobs=[],slowSteps=[],old=q.tick,advance=q.advance,complete=q.complete,start=q.start;let advances=0;
    q.complete=function(...a){const at=performance.now(),before=q.current?{next:q.current.next,total:q.current.ops.length}:null;try{return complete.apply(this,a)}finally{completeCalls.push({at:at-t,ms:performance.now()-at,before})}};
    q.start=function(scratch,ops,done,...rest){const job={at:performance.now()-t,total:ops.length,end:null};jobs.push(job);return start.call(this,scratch,ops,function(...a){job.end=performance.now()-t;return done.apply(this,a)},...rest)};q.advance=function(...a){advances++;return advance.apply(this,a)};
    q.tick=function(...a){const at=performance.now(),n=advances;try{return old.apply(this,a)}finally{ticks.push({ms:performance.now()-at,advances:advances-n})}};
    const snap=()=>({elapsed:performance.now()-t,log:e._log.entries.length,pending:e._opQueue.length,settle:e._settle?{next:e._settle.next,total:e._settle.ops.length}:null,rebuild:e._rebuildJobs.size,reveals:e._washReveals.size});
    const timer=setInterval(()=>__loadProgress(snap()),5000);let solver=null,completed=false;
    try{
     for(const op of input)e.appendOperation(op,'remote');
     while(performance.now()-t<300000){if(!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size){solver??=performance.now()-t;if(!e._washReveals.size){completed=true;break}}await new Promise(r=>setTimeout(r,50))}
     return {completed,solverMs:solver,final:snap(),ticks,completeCalls,jobs,gl:e.gl.getError(),lost:e.gl.isContextLost(),entries:e._log.entries.map(x=>({id:x.op.id,seq:x.serverSeq,pending:x.pending,type:x.op.type})),operations:e.getOperations().map(o=>({id:o.id,seq:o.seq,type:o.type,strokeId:o.strokeId}))};
    }finally{clearInterval(timer);q.tick=old;q.advance=advance;q.complete=complete;q.start=start}
   },{input,batch});save();
   if(run.result.entries.some((x,i)=>x.pending||x.seq!==i+1))throw Error('Authoritative seq1..47 gate');
   if(!run.result.completed||run.result.gl||run.result.lost||run.result.final.log!==47)throw Error('Completed journal/GL guard');
   const png=await page.evaluate(async()=>{const b=await __engine.exportPNG();if(!b)throw Error('Empty export');return new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)})});
   writeFileSync(out+'/'+(batch?'on':'off')+'.png',Buffer.from(png,'base64'));run.pngSaved=true;save();
  }finally{await context.close()}
 }
}catch(e){report.error=String(e);save();throw e}finally{clearTimeout(deadline);await browser?.close();report.ownedChromeClosed=true;save();console.log('OWNED_CHROME_CLOSED')}
