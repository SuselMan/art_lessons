/* Focused two-author room probe. Never opens existing user tabs or clears a layer.
 * QA_ROOM must be a NEW disposable empty room; its owner state is required.
 * See README.md. This intentionally fails against the pre-undo-v1 implementation.
 */
const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const env=process.env;
for(const name of ['QA_ENTRY_URL','QA_BASE_URL','QA_ROOM','QA_OUTPUT','QA_HOST_STATE'])
  if(!env[name])throw Error('Missing '+name);
if(env.QA_DISPOSABLE_ROOM!==env.QA_ROOM)throw Error('Set QA_DISPOSABLE_ROOM to the exact disposable QA_ROOM id');
fs.mkdirSync(env.QA_OUTPUT,{recursive:true});
const report={scope:'Target pixels and effective material; two independent authors. Same-rasterizer parity only.',cases:[],errors:[]};
let browser;const contexts=[];
(async()=>{
  browser=env.QA_CDP?await chromium.connectOverCDP(env.QA_CDP):await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const pages=[];
  for(const [index,state] of [[0,env.QA_HOST_STATE],[1,null]]){
    const context=await browser.newContext({...state?{storageState:state}:{},viewport:{width:1100,height:850}});contexts.push(context);
    const p=await context.newPage();pages.push(p);p.setDefaultTimeout(180000);
    p.on('pageerror',e=>report.errors.push({author:index,message:e.message}));
    await context.request.get(env.QA_ENTRY_URL);
    await p.goto(new URL('/room/'+env.QA_ROOM+'?qaModel=m70-r2-v1',env.QA_BASE_URL).href);
    await p.waitForFunction(()=>window.__engine&&!__engine._locked||document.querySelector('form input[type="text"]'));
    if(await p.locator('form input[type="text"]').count()){
      await p.locator('form input[type="text"]').first().fill('Undo v1 QA '+index);
      await p.locator('form button[type="submit"]').click();
    }
    await p.waitForFunction(()=>window.__engine&&!__engine._locked);
    await p.evaluate(()=>__engine.paperReady());
  }
  const [a,b]=pages;
  const identity=await a.evaluate(()=>({model:__engine._watercolorModel,strokes:__engine.getOperations().filter(o=>o.type==='stroke').length,user:__roomStore.getState().userId}));
  assert.equal(identity.model,'m70-r2-v1');assert.equal(identity.strokes,0,'Refusing nonempty fixture');
  assert.notEqual(identity.user,await b.evaluate(()=>__roomStore.getState().userId),'Independent authors required');
  report.identity=identity;report.renderer=await a.evaluate(()=>{const gl=__engine.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null});if(env.QA_CDP)assert.ok(report.renderer&&!/swiftshader|llvmpipe/i.test(report.renderer),'Real hardware CDP required');
  const idle=async()=>{for(const p of pages)await p.waitForFunction(()=>{const e=__engine;return !e._contextLost&&!e._pendingRebuilds.size&&!e._rebuildJobs.size&&!e._opQueue.length&&!e._puddle?.state.pending&&!e._wcCanonical.pending&&!e._settle},null,{timeout:45000})};
  const sync=async(p)=>{const id=await p.evaluate(()=>__engine.getOperations().at(-1)?.id);console.log('SYNC',id);for(const peer of pages)await peer.waitForFunction(id=>__engine.getOperations().some(o=>o.id===id),id,{timeout:20000});await idle();return id};
  const append=async(p,draft)=>{const id=await p.evaluate(draft=>{const op={...draft,id:crypto.randomUUID(),userId:__roomStore.getState().userId,timestamp:Date.now()};__engine.appendOperation(op);return op.id},draft);await sync(p);return id};
  const layer=async(name)=>{const id='qa-'+crypto.randomUUID();await append(a,{type:'layer_add',layerId:id,name});for(const p of pages)await p.evaluate(id=>{const s=__roomStore.getState();s.setLayerStateLocal(prev=>({...prev,activeId:id}));__engine.setActiveLayer(id)},id);return id};
  const stroke=async(p,{pigment=.65,x=220,y=300,vertical=false,tool='watercolor'}={})=>{
    await p.evaluate(({pigment,tool})=>{const s=__roomStore.getState();s.setTool(tool);for(const[k,v]of Object.entries({size:45,water:1,pigment,pressureResponse:'normal',nib:'round',color:[.15,.35,.8]}))s.setToolSetting(tool,k,v)}, {pigment,tool});
    await p.waitForFunction(tool=>__engine._opts.tool===tool,tool);await p.evaluate(()=>__engine.setColor([.15,.35,.8]));
    const ids=await p.evaluate(({x,y,vertical})=>{const e=__engine,previous=new Set(e.getOperations().map(o=>o.id));let t=1000;const ev=i=>({x:(x+(vertical?0:i*8))*.5,y:(y+(vertical?i*8:0))*.5,pressure:.8,tiltX:0,tiltY:0,speed:.4,pointerType:'pen',timeStamp:t+=16});e._onStart(ev(0));if(e._dwellTimer){clearInterval(e._dwellTimer);e._dwellTimer=null}if(!e._strokeId)throw Error('Stroke refused');for(let i=1;i<=20;i++)e._onMove(ev(i));e._onEnd(ev(20));return e.getOperations().filter(o=>o.type==='stroke'&&!previous.has(o.id)).map(o=>o.id)}, {x,y,vertical});
    assert.ok(ids.length,'Stroke committed');await sync(p);return ids;
  };
  const undo=async(p)=>{const id=await p.evaluate(()=>{const op=__engine.undo();if(!op)throw Error('Undo refused');return op.id});await sync(p);return id};
  const redo=async(p)=>{await p.evaluate(()=>{if(!__engine.redo())throw Error('Redo refused')});await sync(p)};
  const material=async(p,id)=>p.evaluate(id=>__engine._log.layerPixelOps(id).filter(o=>o.type==='stroke').map(o=>({id:o.id,tool:o.tool,water:o.tool==='watercolor'?Number(o.preset.split(':')[1]):0,pigment:o.tool==='watercolor'?Number(o.preset.split(':')[2]):null})),id);
  const pixels=async(p,id)=>p.evaluate(id=>{const data=__engine.bakeLayerByFullReplay(id);return data?Array.from(data):null},id);
  const hash=bytes=>crypto.createHash('sha256').update(Buffer.from(bytes||[])).digest('hex');
  const check=async(name,id)=>{await idle();const left=await pixels(a,id),right=await pixels(b,id);assert.deepEqual(left,right,name+' target divergence');const data={name,layer:id,targetHash:hash(left),bytes:left?.length??0,material:await material(a,id)};report.cases.push(data);console.log('CHECKPOINT',name,data.targetHash);return left};
  const expectMix=(entries,ids,pigment)=>{for(const id of ids){const op=entries.find(o=>o.id===id);if(pigment===null)assert.equal(op,undefined,'Stroke should be removed');else{assert.ok(op,'Retained source missing');assert.equal(op.pigment,pigment);assert.ok(op.water>0)}}};
  // Dependent colored gesture: undo retains all water, redo restores exact target.
  let id=await layer('overlap-retention');const aa=await stroke(a);await stroke(b,{x:300,y:240,vertical:true});const before=await check('overlap-before',id);
  await undo(a);expectMix(await material(a,id),aa,0);const after=await check('overlap-undo',id);assert.notDeepEqual(before,after,'Pigment removal must change pixels');
  await redo(a);assert.deepEqual(await check('overlap-redo',id),before,'Redo must restore target');
  await undo(a);await undo(b);assert.equal((await material(a,id)).length,0,'Water must release when foreign gesture is undone');await check('water-released',id);await append(a,{type:'paper_dry',layerId:id});
  // Pure water cannot be tested by pigment hash alone: inspect effective source.
  id=await layer('pure-water-release');const water=await stroke(a,{pigment:0});await stroke(b,{x:300,y:240,vertical:true});await undo(a);expectMix(await material(a,id),water,0);await check('pure-water-retained',id);await undo(b);assert.equal((await material(a,id)).length,0);await check('pure-water-released',id);await append(a,{type:'paper_dry',layerId:id});
  // Disjoint foreign gesture does not retain water.
  id=await layer('disjoint');const disjoint=await stroke(a,{x:160,y:160});await stroke(b,{x:650,y:650});await undo(a);expectMix(await material(a,id),disjoint,null);await check('disjoint-full-undo',id);await append(a,{type:'paper_dry',layerId:id});
  // A latest connecting gesture is fully removable, then redo is exact.
  id=await layer('bridge');await stroke(a,{x:150,y:300});await stroke(b,{x:510,y:300});const bridge=await stroke(a,{x:330,y:300});const bridged=await check('bridge-before',id);await undo(a);expectMix(await material(a,id),bridge,null);await check('bridge-removed',id);await redo(a);assert.deepEqual(await check('bridge-redo',id),bridged);await append(a,{type:'paper_dry',layerId:id});
  // Explicit layer barrier must not dry another layer, and remains undoable.
  const wetLayer=await layer('other-wet-layer');await stroke(a);const dryLayer=await layer('dry-and-eraser');await stroke(a);const wet=await check('wet-before-eraser',dryLayer);
  await stroke(b,{tool:'eraser',x:220,y:300});assert.deepEqual(await check('eraser-leaves-wet',dryLayer),wet,'Eraser affected wet pigment');await undo(b);
  const dry=await append(a,{type:'paper_dry',layerId:dryLayer});const dryOp=await a.evaluate(id=>__engine.getOperations().find(o=>o.id===id),dry);assert.equal(dryOp.layerId,dryLayer);
  await stroke(b,{tool:'eraser',x:220,y:300});assert.notDeepEqual(await check('eraser-removes-dry',dryLayer),wet,'Eraser failed on dry pigment');
  await append(a,{type:'operation_undo',targetOpId:dry});assert.deepEqual(await check('undo-dry-restores-wet-under-eraser',dryLayer),wet);
  await append(a,{type:'operation_redo',targetOpId:dry});await check('redo-dry-reapplies-eraser',dryLayer);
  for(const p of pages)await p.evaluate(id=>{const s=__roomStore.getState();s.setLayerStateLocal(prev=>({...prev,activeId:id}));__engine.setActiveLayer(id)},wetLayer);
  const renewed=await stroke(a);await append(a,{type:'paper_dry',layerId:dryLayer});const latestErase=await stroke(b,{tool:'eraser'});const wetAge=await a.evaluate(({renewed,latestErase})=>{const ops=__engine._log.entries.map(e=>e.op);return ops.find(o=>o.id===latestErase.at(-1)).timestamp-ops.find(o=>o.id===renewed.at(-1)).timestamp},{renewed,latestErase});assert.ok(wetAge>=0&&wetAge<120000,'Other-layer fixture exceeded natural wet lifetime');const erasedWet=await check('other-layer-wet-eraser',wetLayer);await undo(b);const otherWet=await check('other-layer-wet-eraser-undo',wetLayer);assert.deepEqual(erasedWet,otherWet,'Dry affected unrelated layer');await redo(b);assert.deepEqual(await check('other-layer-wet-eraser-redo',wetLayer),otherWet);
  // Rejoin independently recomputes the final fixture without local-only state.
  const expected=await pixels(a,dryLayer);await b.reload();await b.waitForFunction(()=>window.__engine&&!__engine._locked||document.querySelector('form input[type="text"]'));if(await b.locator('form input[type="text"]').count()){await b.locator('form input[type="text"]').first().fill('Undo v1 QA rejoin');await b.locator('form button[type="submit"]').click()}await b.waitForFunction(()=>window.__engine&&!__engine._locked);await b.evaluate(()=>__engine.paperReady());await sync(a);assert.deepEqual(await pixels(b,dryLayer),expected,'Rejoin target mismatch');
  for(const p of pages)assert.equal(await p.evaluate(()=>__engine.gl.getError()),0);
  for(const lid of [wetLayer,dryLayer])await append(a,{type:'paper_dry',layerId:lid});
  await idle();
  for(const [i,p]of pages.entries()){
    await p.screenshot({path:env.QA_OUTPUT+'/final-dry-'+i+'.png'});
    for(const lid of [wetLayer,dryLayer]){
      const live=await p.evaluate(id=>{const data=__engine.bakeNetworkSnapshot(id);return data?Array.from(data):null},lid);
      assert.deepEqual(live,await pixels(p,lid),'Live dry pixels disagree with full replay target, page '+i);
    }
  }
  assert.deepEqual(report.errors,[]);report.pass=true;
})().catch(async error=>{report.pass=false;report.failure=error.stack;process.exitCode=1;
  for(const [i,c]of contexts.entries())for(const p of c.pages())try{
    await p.screenshot({path:env.QA_OUTPUT+'/failure-'+i+'.png',timeout:10000});
    report['diagnostic'+i]=await p.evaluate(()=>({url:location.href,text:document.body.innerText.slice(0,2000),engine:window.__engine?{locked:__engine._locked,queue:__engine._opQueue.length,pendingRebuilds:[...__engine._pendingRebuilds],jobs:__engine._rebuildJobs.size,puddle:__engine._puddle?.state,operations:__engine.getOperations().map(o=>({id:o.id,type:o.type,layerId:o.layerId})),entries:__engine._log.entries.map(e=>({id:e.op.id,type:e.op.type,state:e.state,user:e.op.userId,seq:e.op.seq,pending:e.pending})),store:{user:__roomStore.getState().userId,active:__roomStore.getState().layerState.activeId,connection:__roomStore.getState().connectionStatus}}:null}));
  }catch(diag){report['diagnosticError'+i]=diag.message}
}).finally(async()=>{
  await Promise.allSettled(contexts.map(c=>c.close()));if(browser)await browser.close().catch(()=>{});
  fs.writeFileSync(env.QA_OUTPUT+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,failure:report.failure}));
});
