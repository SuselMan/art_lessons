// Own hardware context only. Read actual layer bytes before any oracle/close.
const {chromium}=require('@playwright/test');const fs=require('node:fs'),assert=require('node:assert/strict');
const env=process.env;for(const k of ['QA_CDP','QA_ENTRY_URL','QA_BASE_URL','QA_ROOM','QA_HOST_STATE','QA_OUTPUT'])if(!env[k])throw Error(k+' required');
if(env.QA_ROOM!==env.QA_DISPOSABLE_ROOM)throw Error('Own disposable fixture only');fs.mkdirSync(env.QA_OUTPUT,{recursive:true});
const report={source:env.QA_SOURCE,kind:'actual GPU wet material then independent red shape',errors:[]};let browser,context;
(async()=>{
 browser=await chromium.connectOverCDP(env.QA_CDP);context=await browser.newContext({storageState:env.QA_HOST_STATE,viewport:{width:1000,height:800},deviceScaleFactor:1});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await context.request.get(env.QA_ENTRY_URL);await page.goto(new URL('/room/'+env.QA_ROOM+'?qaModel=m70-r2-v1',env.QA_BASE_URL).href);
 await page.waitForFunction(()=>window.__engine&&!__engine._locked||document.querySelector('form input[type="text"]'));
 if(await page.locator('form input[type="text"]').count()){await page.locator('form input[type="text"]').first().fill('Wet shape QA');await page.locator('form button[type="submit"]').click()}
 await page.waitForFunction(()=>window.__engine&&!__engine._locked);await page.evaluate(()=>__engine.paperReady());
 const layer='qa-wet-shape';await page.evaluate(layer=>{const e=__engine,s=__roomStore.getState();e.appendOperation({id:crypto.randomUUID(),type:'layer_add',layerId:layer,name:'Wet shape',userId:s.userId,timestamp:Date.now()});s.setLayerStateLocal(p=>({...p,activeId:layer}));e.setActiveLayer(layer);s.setTool('watercolor');s.setToolSetting('watercolor','size',55);s.setToolSetting('watercolor','water',.95);s.setToolSetting('watercolor','pigment',.34)},layer);
 await page.waitForFunction(()=>__engine._opts.tool==='watercolor'&&__engine._opts.pencilType.startsWith('normal:95:34:'));
 report.paint=await page.evaluate(()=>{const e=__engine;e.setColor([.1,.2,.8]);const ev=i=>({x:40+i*7,y:80,pressure:.75,tiltX:0,tiltY:0,speed:.4,pointerType:'pen',timeStamp:performance.now()});e._onStart(ev(0));for(let i=1;i<=15;i++)e._onMove(ev(i));e._onEnd(ev(15));return{stroke:e._log.entries.at(-1).op.id,model:e._watercolorModel,puddle:e._puddle.state,page:e._paper.pageSize()}});
 const read=()=>page.evaluate(layer=>{const e=__engine,t=e._layers.get(layer).allResident()[0],pixels=t.buffer.readPixels();let red=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>200&&pixels[i+1]<40&&pixels[i+2]<40&&pixels[i+3]>200)red++;return{red,puddle:e._puddle.state,glError:e.gl.getError()}},layer);
 report.before=await read();
 await page.evaluate(layer=>{const e=__engine;e.appendOperation({id:crypto.randomUUID(),type:'shape',userId:__roomStore.getState().userId,timestamp:Date.now(),layerId:layer,geometry:{kind:'rectangle',cornerRadius:0},frame:{x:350,y:250,width:100,height:100,angle:0},stroke:null,fill:{color:[1,0,0]}})},layer);
 report.immediate=await read();assert.ok(report.immediate.red>500,'Independent red shape must initially exist');
 await page.waitForFunction(()=>!__engine._puddle.state.pending,null,{timeout:30000});
 await page.evaluate(()=>new Promise(resolve=>{let remaining=8;const tick=()=>--remaining?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick)}));
 report.after=await read();await page.screenshot({path:env.QA_OUTPUT+'/after.png'});
 assert.equal(report.after.red,report.immediate.red,'M70 presentation overwrote the independent shape');assert.equal(report.after.glError,0);assert.deepEqual(report.errors,[]);report.ok=true;
})().catch(e=>{report.ok=false;report.error=e.stack;process.exitCode=1}).finally(async()=>{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});fs.writeFileSync(env.QA_OUTPUT+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,redBefore:report.immediate?.red,redAfter:report.after?.red,error:report.error?.split('\n')[0]}))});
