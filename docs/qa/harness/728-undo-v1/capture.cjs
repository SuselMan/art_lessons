// Read-only rejoin of our explicitly disposable fixture; no drawing or mutation.
const {chromium}=require('@playwright/test');
const {historyReady}=require('./history-ready.cjs');
const fs=require('node:fs'),crypto=require('node:crypto');
for(const key of ['QA_CDP','QA_ENTRY_URL','QA_BASE_URL','QA_ROOM','QA_OUTPUT','QA_HOST_STATE'])if(!process.env[key])throw Error('Missing '+key);
const env=process.env;if(env.QA_DISPOSABLE_ROOM!==env.QA_ROOM)throw Error('Explicit disposable fixture required');
fs.mkdirSync(env.QA_OUTPUT,{recursive:true});
(async()=>{const b=await chromium.connectOverCDP(env.QA_CDP);let c;try{
 let p;if(env.QA_CAPTURE_EXISTING==='1'){for(const context of b.contexts())for(const candidate of context.pages())if(candidate.url().includes(env.QA_ROOM)&&await candidate.evaluate(()=>!!window.__engine))p=candidate;if(!p)throw Error('No existing own fixture engine page')}else{c=await b.newContext({storageState:env.QA_HOST_STATE,viewport:{width:1100,height:850}});p=await c.newPage();p.setDefaultTimeout(90000);await c.request.get(env.QA_ENTRY_URL);await p.goto(new URL('/room/'+env.QA_ROOM+'?qaModel=m70-r2-v1',env.QA_BASE_URL).href);}
 await p.waitForFunction(()=>window.__engine&&!__engine._locked||document.querySelector('form input[type="text"]'));
 if(await p.locator('form input[type="text"]').count()){await p.locator('form input[type="text"]').first().fill('Undo target read-only QA');await p.locator('form button[type="submit"]').click()}
 await p.waitForFunction(()=>window.__engine&&!__engine._locked);await p.evaluate(()=>__engine.paperReady());
 await p.waitForFunction(()=>{const e=__engine;return !e._locked&&!e._pendingRebuilds.size&&!e._rebuildJobs.size&&!e._opQueue.length&&!e._puddle?.state.pending});
 const history=await historyReady(p,env.QA_BASE_URL,env.QA_ROOM);
 const layers=await p.evaluate(()=>__engine.getOperations().filter(o=>o.type==='layer_add'&&o.layerId.startsWith('qa-')).map(o=>({id:o.layerId,name:o.name})));
 const result={room:env.QA_ROOM,authoritativeHistory:history.operations,journal:history.journal,model:await p.evaluate(()=>__engine._watercolorModel),renderer:await p.evaluate(()=>{const gl=__engine.gl,x=gl.getExtension('WEBGL_debug_renderer_info');return x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):null}),targets:[]};
 if(env.QA_DRY_LIVE==='1')for(const layer of layers){await p.evaluate(layerId=>{const op={id:crypto.randomUUID(),type:'paper_dry',layerId,userId:__roomStore.getState().userId,timestamp:Date.now()};__engine.appendOperation(op)},layer.id);await p.waitForFunction(()=>!__engine._puddle?.state.pending&&!__engine._opQueue.length&&!__engine._log.hasPendingPaperDry());}
 for(const layer of layers){const liveBefore=(env.QA_DRY_LIVE==='1'||env.QA_COMPARE_LIVE==='1')?await p.evaluate(id=>{const data=__engine.bakeNetworkSnapshot(id);return data?Array.from(data):[]},layer.id):null;const bytes=await p.evaluate(id=>{const data=__engine.bakeLayerByFullReplay(id);return data?Array.from(data):[]},layer.id);if(env.QA_SAVE_TARGET_BYTES==='1')fs.writeFileSync(env.QA_OUTPUT+'/'+layer.id+'.bin',Buffer.from(bytes));result.targets.push({...layer,bytes:bytes.length,hash:crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')});if(env.QA_DRY_LIVE==='1'||env.QA_COMPARE_LIVE==='1'){const live=liveBefore;if(env.QA_SAVE_TARGET_BYTES==='1')fs.writeFileSync(env.QA_OUTPUT+'/'+layer.id+'.live.bin',Buffer.from(live));result.targets.at(-1).liveBytes=live.length;result.targets.at(-1).liveHash=crypto.createHash('sha256').update(Buffer.from(live)).digest('hex');result.targets.at(-1).liveMatchesTarget=JSON.stringify(bytes)===JSON.stringify(live)}console.log('CAPTURE',layer.name,result.targets.at(-1).hash)}
 await p.screenshot({path:env.QA_OUTPUT+'/rejoin.png'});fs.writeFileSync(env.QA_OUTPUT+'/final-targets.json',JSON.stringify(result,null,2));if(result.targets.some(t=>t.liveMatchesTarget===false))throw Error('Live dry pixels differ from full-replay target; saved report');
 }finally{if(c)await c.close();await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
