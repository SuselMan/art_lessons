import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{createHash}from'node:crypto';import{chromium}from'playwright';
if(process.env.DISPLAY_GPU_SLOT!=='granted')throw Error('Explicit root GPU grant required')
const manifest=JSON.parse(readFileSync('temp/display-ab/manifest.json'))
if(manifest.sourceCommit!=='c17ab35a')throw Error('Immutable source stamp required')
for(const[f,h]of Object.entries(manifest.files))if(createHash('sha256').update(readFileSync(f)).digest('hex')!==h)throw Error('Frozen source mismatch '+f)
const out=process.env.OUT||'temp/display-alpha/results';mkdirSync(out,{recursive:true})
const report={source:manifest.sourceCommit,phases:[],native:[]},save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));let browser,timer,currentPage
const stage=name=>{report.phase={name,at:new Date().toISOString()};save();console.log(JSON.stringify(report.phase));clearTimeout(timer);timer=setTimeout(()=>browser?.close(),180000)}
const expected={diagnosticSegmentDelivery:'combined',diagnosticPigmentRecord:true,diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticSolventField:true,diagnosticCanonicalSettleRadius:true,diagnosticLandingPolicy:'fluid',diagnosticWaterPolicy:'bottomless',diagnosticForeignSolvent:true}
async function fresh(on){
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000},deviceScaleFactor:1});await context.addInitScript(on=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,opts,...args){if(type==='webgl'&&opts?.preserveDrawingBuffer===true&&opts?.premultipliedAlpha===false&&opts?.antialias===false)opts={...opts,alpha:!on};return original.call(this,type,opts,...args)}},on);const page=await context.newPage();currentPage=page
 page.on('dialog',d=>d.accept());page.on('pageerror',e=>{(report.errors??=[]).push(e.stack);save()})
 await page.goto(process.env.APP_URL+'/create');await page.locator('form input[type=text]').first().fill('Scissor frozen c17 QA');await page.getByRole('button',{name:/Medium/}).first().click();const a2=page.getByText('A2',{exact:true}).first();await a2.click();await a2.click();await page.locator('form button[type=submit]').click();await page.waitForURL(/\/room\//);await page.waitForFunction(()=>window.__engine&&!window.__engine.gl.isContextLost());await page.evaluate(()=>__engine.paperReady())
 const passport=await page.evaluate(on=>{const e=__engine,g=e.gl,d=g.getExtension('WEBGL_debug_renderer_info');if(typeof e._diagnosticBlitScissor!=='boolean')throw Error('Compiled c17 diagnostic absent');e._diagnosticRevealPause=false;e._diagnosticDisplayRafCancel=false;e._diagnosticBlitScissor=false;e._settleQueue.idleBatch=false;return{roomPage:e._pageSize(),on,actualFlag:e._diagnosticBlitScissor,attrs:g.getContextAttributes(),debug:e._debug,pendingTimestamp:e._dbgPendingFrameTimestamp,renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'',flags:Object.fromEntries(['diagnosticSegmentDelivery','diagnosticPigmentRecord','diagnosticSharedFluid','diagnosticLandingReservoir','diagnosticSolventField','diagnosticCanonicalSettleRadius','diagnosticLandingPolicy','diagnosticWaterPolicy','diagnosticForeignSolvent'].map(k=>[k,e._ribbonPainter[k]]))}},on)
 if(passport.roomPage.w!==3508||passport.roomPage.h!==2480)throw Error('Actual A2 landscape required');if(!/AMD|Vega|Radeon/.test(passport.renderer)||passport.debug||!passport.attrs.preserveDrawingBuffer||passport.actualFlag!==false||passport.attrs.alpha!==!on)throw Error('Actual GPU/attrs/debug/flag gate')
 for(const[k,v]of Object.entries(expected))if(passport.flags[k]!==v)throw Error('Flag mismatch '+k)
 await page.evaluate(readFileSync('temp/display-alpha/pixelProbe.js','utf8'));await page.evaluate(readFileSync('temp/display-ab/S/observe.js','utf8'));await page.evaluate(()=>__observeBlitScissor())
 return{context,page,passport}
}
const idle=async page=>{await page.waitForFunction(()=>{const e=__engine;return!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size&&!e._washReveals.size},null,{timeout:90000})}
const pixel=async(page,label)=>{const p=await page.evaluate(label=>__scissorPixels(label),label);p.last=await page.evaluate(()=>__scissorObserve.counts.last);if(p.fullPixels||p.gl||p.cacheMinAlpha!==255||p.screenMinAlpha!==255)throw Error('Current output differs from same-cache full reference '+label);return p}
async function partialInput(page){
 await page.evaluate(()=>{const e=__engine,s=__roomStore.getState();s.setTool('watercolor');s.setToolSetting('watercolor','size',80);s.setToolSetting('watercolor','water',1);s.setToolSetting('watercolor','pigment',.5);e.setSize(80)})
 const c=await page.locator('canvas').first().boundingBox(),samples=[]
 await page.mouse.move(c.x+650,c.y+620);await page.mouse.down()
 for(let i=1;i<=8;i++){await page.mouse.move(c.x+650+i*15,c.y+620+(i%2)*12);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));samples.push(await pixel(page,'active-'+i))}
 await page.mouse.up();await page.evaluate(()=>__engine._completeSettle());return samples
}
async function outputGates(page,context,on){
 const samples=await partialInput(page);await page.evaluate(()=>__engine.watercolorDryAll());await idle(page)
 const variants=[]
 variants.push(await pixel(page,'dry-idle'))
 const pose=await page.evaluate(()=>({...__engine._camera.pose}))
 await page.evaluate(p=>__engine.setInfiniteCamera(p.wx+40,p.wy+25,p.zoom*.9,.12),pose);variants.push(await pixel(page,'camera-rotation'))
 await page.setViewportSize({width:1400,height:900});await page.waitForTimeout(200);variants.push(await pixel(page,'resize'))
 await page.evaluate(p=>__engine.setInfiniteCamera(p.wx,p.wy,p.zoom,0),pose);variants.push(await pixel(page,'camera-restore'))
 const picks=await page.evaluate(()=>{const e=__engine,{w,h}=e._pageSize();const rows=[];for(let i=0;i<10;i++){const point=[w*(.35+.3*i/9),h*(i%2?.56:.44)];const actual=e.pickColor(...point);e._paperPartialOK=false;e._paperDamage=null;e._display();const full=e.pickColor(...point);rows.push({point,actual,full,exact:JSON.stringify(actual)===JSON.stringify(full)})}return rows})
 if(picks.some(p=>!p.exact||!p.actual))throw Error('Colorpicker stale/mismatched')
 const counts=await page.evaluate(()=>({...__scissorObserve.counts}));
 await page.screenshot({path:out+'/gates-'+on+'.png'});return{samples,variants,picks,counts}
}
async function revealGate(page,on){
 const c=await page.locator('canvas').first().boundingBox()
 const settings=async pigment=>page.evaluate(pigment=>{const e=__engine,s=__roomStore.getState();s.setTool('watercolor');s.setToolSetting('watercolor','size',80);s.setToolSetting('watercolor','water',1);s.setToolSetting('watercolor','pigment',pigment);e.setSize(80)},pigment)
 await settings(0);await page.mouse.move(c.x+650,c.y+450);await page.mouse.down();await page.mouse.move(c.x+850,c.y+450,{steps:12});await page.mouse.up();await page.evaluate(()=>__engine._completeSettle())
 await settings(1);await page.mouse.move(c.x+750,c.y+450);await page.mouse.down();await page.mouse.up();await page.evaluate(()=>__engine._completeSettle())
 const initial=await page.evaluate(()=>[...__engine._washReveals.values()].map(r=>({progressive:r.progressive,startedAt:r.startedAt,duration:r.durationMs})))
 if(!initial.some(r=>r.progressive))throw Error('Actual progressive puddle-pigment reveal absent')
 await page.evaluate(()=>__engine.watercolorDryAll());await page.waitForTimeout(60);await page.mouse.move(c.x+650,c.y+620);await page.mouse.down()
 const timeline=[]
 for(let i=0;i<6;i++){await page.mouse.move(c.x+650+i*20,c.y+620+(i%2)*10);await page.waitForTimeout(250);const pixels=await pixel(page,'reveal-'+i);const state=await page.evaluate(async()=>{const e=__engine,g=e.gl,b=new Uint8Array(260*70*4);g.bindFramebuffer(g.FRAMEBUFFER,null);g.readPixels(630,e.canvas.height-490,260,70,g.RGBA,g.UNSIGNED_BYTE,b);return{pendown:!!e._strokeLayerId,reveals:e._washReveals.size,at:performance.now(),sha:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('')}});if(!state.pendown)throw Error('Reveal gate missed active gesture');timeline.push({pixels,state});await page.screenshot({path:out+'/reveal-'+on+'-'+i+'.png'})}
 await page.mouse.up();await page.waitForTimeout(250);await page.screenshot({path:out+'/reveal-'+on+'-up.png'});return{initial,timeline,moving:new Set(timeline.map(x=>x.state.sha)).size>1,limitation:'Screenshots/readbacks in separate visual gate, excluded from perf. If baseline old-region motion absent, continuity remains inconclusive.'}
}
try{
 browser=await chromium.launch({channel:'chrome',headless:false,env:{...process.env,DISPLAY:':0'}})
 for(const on of [false,true]){stage('fixed65-'+on);const{context,page,passport}=await fresh(on);try{await page.evaluate(readFileSync('temp/display-ab/fixedFixture.js','utf8'));await page.evaluate(readFileSync('temp/display-ab/canonicalProbe.js','utf8'));const timing=await page.evaluate(()=>__queueFixedFixture(false)),canonical=await page.evaluate(()=>__idleBatchCanonical());if(canonical.gl||!canonical.hashes.some(x=>x.key==='inkLoad'&&x.sum[2]>0))throw Error('Nonempty canonical gate');const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await(await __engine.exportPNG(true)).arrayBuffer())));writeFileSync(out+'/fixed-'+on+'.png',Buffer.from(bytes));writeFileSync(out+'/fixed-'+on+'.json',JSON.stringify(canonical));report.phases.push({on,passport,timing,pixel:await pixel(page,'fixed65')});save();stage('output-gates-'+on);report.phases.at(-1).gates=await outputGates(page,context,on);save()}finally{await context.close()}}
 const a=JSON.parse(readFileSync(out+'/fixed-false.json')),b=JSON.parse(readFileSync(out+'/fixed-true.json'));report.fixedExact=JSON.stringify(a.hashes)===JSON.stringify(b.hashes)&&readFileSync(out+'/fixed-false.png').equals(readFileSync(out+'/fixed-true.png'));save();if(!report.fixedExact)throw Error('Same65 source fields/PNG mismatch')
 for(const on of [false,true]){stage('reveal-'+on);const{context,page,passport}=await fresh(on);try{report.phases.push({revealOnly:true,on,passport,reveal:await revealGate(page,on)});save()}finally{await context.close()}}
 const revealRows=report.phases.filter(x=>x.revealOnly);report.revealContinuity=revealRows[0].reveal.moving?(revealRows[1].reveal.moving?'motion-observed-both':'FAILED-ON-motion-absent'):'INCONCLUSIVE-baseline-motion-absent';save();if(report.revealContinuity.startsWith('FAILED'))throw Error(report.revealContinuity)
 for(const on of [false,true,true,false]){stage('native-'+on+'-'+report.native.length);const{context,page,passport}=await fresh(on);try{await page.evaluate(readFileSync('temp/display-ab/pageBench.js','utf8'));const native=await page.evaluate(()=>__nativePerf({scenario:'burst',size:80,legs:8,legMs:150,tailLimitMs:60000,stamp:'c17ab35a',idleBatch:false}));const ack=await page.evaluate(()=>__engine._log.entries.filter(x=>x.op.type==='stroke').map(x=>({seq:x.serverSeq,pending:!!x.pending})));const counts=await page.evaluate(()=>({...__scissorObserve.counts}));if(native.passport.debug||native.gl.error||!native.settling.completed||ack.length<3||ack.some(x=>x.pending||x.seq==null))throw Error('Actual native gate');report.native.push({on,passport,native,ack,counts,pixel:await pixel(page,'native-finished')});save()}finally{await context.close()}}
}catch(e){report.error=String(e);if(currentPage)try{report.failure={url:currentPage.url(),body:(await currentPage.locator('body').innerText()).slice(0,1000)};await currentPage.screenshot({path:out+'/failure.png',timeout:5000})}catch{}save();throw e}
finally{clearTimeout(timer);await browser?.close();report.chromeClosed=true;save();console.log('OWNED_CHROME_CLOSED')}
