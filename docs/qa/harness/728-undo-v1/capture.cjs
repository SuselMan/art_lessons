// Read-only rejoin of our explicitly disposable fixture; no drawing or mutation.
const {chromium}=require('@playwright/test');
const fs=require('node:fs'),crypto=require('node:crypto');
for(const key of ['QA_CDP','QA_ENTRY_URL','QA_BASE_URL','QA_ROOM','QA_OUTPUT','QA_HOST_STATE'])if(!process.env[key])throw Error('Missing '+key);
const env=process.env;if(env.QA_DISPOSABLE_ROOM!==env.QA_ROOM)throw Error('Explicit disposable fixture required');
fs.mkdirSync(env.QA_OUTPUT,{recursive:true});
(async()=>{const b=await chromium.connectOverCDP(env.QA_CDP);let c;try{
 c=await b.newContext({storageState:env.QA_HOST_STATE,viewport:{width:1100,height:850}});const p=await c.newPage();p.setDefaultTimeout(90000);await c.request.get(env.QA_ENTRY_URL);await p.goto(new URL('/room/'+env.QA_ROOM+'?qaModel=m70-r2-v1',env.QA_BASE_URL).href);
 await p.waitForFunction(()=>window.__engine&&!__engine._locked||document.querySelector('form input[type="text"]'));
 if(await p.locator('form input[type="text"]').count()){await p.locator('form input[type="text"]').first().fill('Undo target read-only QA');await p.locator('form button[type="submit"]').click()}
 await p.waitForFunction(()=>window.__engine&&!__engine._locked);await p.evaluate(()=>__engine.paperReady());
 await p.waitForFunction(()=>{const e=__engine;return !e._locked&&!e._pendingRebuilds.size&&!e._rebuildJobs.size&&!e._opQueue.length&&!e._puddle?.state.pending});
 const layers=await p.evaluate(()=>__engine.getOperations().filter(o=>o.type==='layer_add'&&o.layerId.startsWith('qa-')).map(o=>({id:o.layerId,name:o.name})));
 const result={room:env.QA_ROOM,model:await p.evaluate(()=>__engine._watercolorModel),renderer:await p.evaluate(()=>{const gl=__engine.gl,x=gl.getExtension('WEBGL_debug_renderer_info');return x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):null}),targets:[]};
 for(const layer of layers){const bytes=await p.evaluate(id=>{const data=__engine.bakeLayerByFullReplay(id);return data?Array.from(data):[]},layer.id);result.targets.push({...layer,bytes:bytes.length,hash:crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')});console.log('CAPTURE',layer.name,result.targets.at(-1).hash)}
 await p.screenshot({path:env.QA_OUTPUT+'/rejoin.png'});fs.writeFileSync(env.QA_OUTPUT+'/final-targets.json',JSON.stringify(result,null,2));
 }finally{if(c)await c.close();await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
