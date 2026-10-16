/* Focused two-author room probe. Never opens existing user tabs or clears a layer.
 * QA_ROOM must be a NEW disposable empty room; its owner state is required.
 * See README.md. This intentionally fails against the pre-undo-v1 implementation.
 */
const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {historyReady,journal,comparable}=require('../history-ready.cjs');
const env=process.env;
for(const name of ['QA_ENTRY_URL','QA_BASE_URL','QA_ROOM','QA_OUTPUT','QA_HOST_STATE'])
  if(!env[name])throw Error('Missing '+name);
if(env.QA_DISPOSABLE_ROOM!==env.QA_ROOM)throw Error('Set QA_DISPOSABLE_ROOM to the exact disposable QA_ROOM id');
fs.mkdirSync(env.QA_OUTPUT,{recursive:true});
const report={campaign:745,scope:'Target pixels and effective material; two independent authors. Same-rasterizer parity only.',cases:[],errors:[]};
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

  const selected=new Set((env.QA_LAYER_CASES||'duplicate-wet,duplicate-dry,clear,delete,merge,move,concurrent,load').split(','));
  const terminalDry=async(...ids)=>{for(const layerId of ids)if(await a.evaluate(id=>__engine._layers.has(id),layerId))await append(a,{type:'paper_dry',layerId});};
  const activate=async id=>{for(const p of pages)await p.evaluate(id=>{const s=__roomStore.getState();s.setLayerStateLocal(prev=>({...prev,activeId:id}));__engine.setActiveLayer(id)},id)};
  const causalUndo=async targetOpId=>append(a,{type:'operation_undo',targetOpId});
  const causalRedo=async targetOpId=>append(a,{type:'operation_redo',targetOpId});
  const stage=async(name,fn)=>{const started=Date.now();console.log('STAGE',name);try{await fn();report.stages.push({name,pass:true,elapsedMs:Date.now()-started})}catch(e){report.stages.push({name,pass:false,elapsedMs:Date.now()-started});throw e}};
  report.stages=[];report.loads=[];report.timingsScope='Wall clock includes CDP, two clients, shader/solver work; not isolated performance measurement';
  const liveCheck=async(name,id)=>{await idle();const captures=[];for(const p of pages){const data=await p.evaluate(async id=>{const e=__engine,target=e._layers.get(id);if(!target)throw Error('Layer absent '+id);e._puddle?.close(target);const codec=await import('/src/engine/src/oplog/snapshotCodec.ts');const tiles=target.allResident().map(t=>({originX:t.originX,originY:t.originY,width:t.buffer.width,height:t.buffer.height,pixels:t.buffer.readPixels()})).filter(t=>{for(let i=3;i<t.pixels.length;i+=4)if(t.pixels[i])return true;return false}).sort((a,b)=>a.originY-b.originY||a.originX-b.originX);const actual=codec.encodeLayerTiles(tiles);const oracle=e.bakeLayerByFullReplay(id)??codec.encodeLayerTiles([]);let changed=0,max=0;for(let i=0;i<Math.max(actual.length,oracle.length);i++){const d=Math.abs((actual[i]??0)-(oracle[i]??0));if(d)changed++;max=Math.max(max,d)}const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');return{actualHash:await hash(actual),oracleHash:await hash(oracle),actualBytes:actual.length,oracleBytes:oracle.length,changedBytes:changed,maxDiff:max,glError:e.gl.getError()}},id);captures.push(data);report.lastLiveCapture={name,layer:id,captures:[...captures]};assert.equal(data.glError,0);assert.equal(data.changedBytes,0,name+' actual live target differs from full replay')}assert.equal(captures[0].actualHash,captures[1].actualHash,name+' participant divergence');report.cases.push({name,layer:id,captures});console.log('LIVE',name,captures[0].actualHash);return captures[0].actualHash};
  for(const wet of [true,false])if(selected.has('duplicate-'+(wet?'wet':'dry')))await stage('duplicate-'+(wet?'wet':'dry'),async()=>{const src=await layer('night-duplicate-source-'+wet);await stroke(a);if(!wet)await terminalDry(src);const id='qa-'+crypto.randomUUID();await append(a,{type:'layer_duplicate',layerId:id,sourceId:src,name:'night-copy',sourceOpacity:1,sourceVisible:true,parentId:null,index:0});await liveCheck('duplicate-'+(wet?'wet':'dry'),id);await terminalDry(src,id)});

  if(selected.has('historical-copy'))await stage('historical-copy-keeps-dry-boundary',async()=>{
    const src=await layer('night-historical-source');await stroke(a,{x:220,y:300});const dry=await append(a,{type:'paper_dry',layerId:src});await stroke(b,{x:300,y:240,vertical:true});
    const id='qa-'+crypto.randomUUID();await append(b,{type:'layer_duplicate',layerId:id,sourceId:src,name:'night-historical-copy',sourceOpacity:1,sourceVisible:true,parentId:null,index:0});
    const before=await liveCheck('historical-copy-before-source-undo',id);await causalUndo(dry);await check('historical-source-after-undo-dry',src);
    assert.equal(await liveCheck('historical-copy-after-source-undo',id),before,'Later source undo changed the historical copy');
    await terminalDry(src,id);const expected=await journal(a);await b.reload();await b.waitForFunction(()=>window.__engine&&!__engine._locked||document.querySelector('form input[type="text"]'));if(await b.locator('form input[type="text"]').count()){await b.locator('form input[type="text"]').first().fill('Historical copy rejoin');await b.locator('form button[type="submit"]').click()}await b.waitForFunction(()=>window.__engine&&!__engine._locked);const restored=await historyReady(b,env.QA_BASE_URL,env.QA_ROOM);assert.deepEqual(comparable(restored.journal),comparable(expected),'Historical copy rejoin journal mismatch');assert.equal(await liveCheck('historical-copy-cold-rejoin',id),before,'Cold replay changed the historical copy');
  });
  if(selected.has('clear'))await stage('clear-undo-redo',async()=>{const id=await layer('night-clear');await stroke(a);const before=await check('clear-before',id);const op=await append(a,{type:'layer_clear',layerId:id});assert.equal((await pixels(a,id))?.length??0,0,'Clear must leave empty target');await causalUndo(op);assert.deepEqual(await check('clear-undo',id),before);await liveCheck('clear-undo-live',id);await causalRedo(op);await liveCheck('clear-redo',id);await terminalDry(id)});
  if(selected.has('delete'))await stage('delete-undo-redo',async()=>{const id=await layer('night-delete');await stroke(a);const before=await check('delete-before',id);const op=await append(a,{type:'layer_delete',layerIds:[id]});for(const p of pages)assert.equal(await p.evaluate(id=>__engine._layers.has(id),id),false);await causalUndo(op);assert.deepEqual(await check('delete-undo',id),before);await liveCheck('delete-undo-live',id);await causalRedo(op);for(const p of pages)assert.equal(await p.evaluate(id=>__engine._layers.has(id),id),false)});
  if(selected.has('merge'))await stage('merge-wet-undo',async()=>{const lower=await layer('night-merge-lower');await stroke(a,{x:180,y:200});const upper=await layer('night-merge-upper');await stroke(b,{x:260,y:260});const id='qa-'+crypto.randomUUID();const op=await append(a,{type:'layer_merge',layerId:id,name:'night-merged',sources:[{id:lower,opacity:1},{id:upper,opacity:1}],parentId:null,index:0});await liveCheck('merge-wet',id);await causalUndo(op);await check('merge-undo-lower',lower);await check('merge-undo-upper',upper);await liveCheck('merge-undo-lower-live',lower);await liveCheck('merge-undo-upper-live',upper);await terminalDry(lower,upper)});
  if(selected.has('move'))await stage('move-through-folder',async()=>{const id=await layer('night-move');await stroke(a);const before=await check('move-before',id);const folder='qa-'+crypto.randomUUID();await append(a,{type:'folder_add',layerId:folder,name:'night-folder'});const op=await append(a,{type:'layer_move',layerIds:[id],parentId:folder,index:0});assert.deepEqual(await check('move-folder',id),before);await causalUndo(op);assert.deepEqual(await check('move-undo',id),before);await liveCheck('move-undo-live',id);await terminalDry(id)});
  if(selected.has('concurrent'))await stage('two-authors-simultaneous',async()=>{const id=await layer('night-concurrent');await Promise.all([stroke(a,{x:200,y:220}),stroke(b,{x:260,y:180,vertical:true})]);await liveCheck('two-authors-simultaneous',id);await terminalDry(id)});
  if(selected.has('three-wet-layers'))await stage('three-wet-layers',async()=>{for(let n=0;n<3;n++){const id=await layer('night-wet-'+n);await stroke(a,{x:200,y:200});report.cases.push({name:'wet-layer-created',layer:id,index:n})}});

  if(selected.has('reconnect'))await stage('offline-local-stroke-and-foreign-contribution',async()=>{
    const id=await layer('night-reconnect');await stroke(a,{x:180,y:180});
    const localOnly=async(p,x)=>p.evaluate(x=>{const e=__engine,held=new Set(e.getOperations().map(o=>o.id));let t=1000;const at=i=>({x:x+i*4,y:140,pressure:.8,tiltX:0,tiltY:0,speed:.4,pointerType:'pen',timeStamp:t+=16});e._onStart(at(0));if(e._dwellTimer){clearInterval(e._dwellTimer);e._dwellTimer=null}if(!e._strokeId)throw Error('Offline local input refused');for(let i=1;i<=18;i++)e._onMove(at(i));e._onEnd(at(18));return e.getOperations().filter(o=>o.type==='stroke'&&!held.has(o.id)).map(o=>o.id)},x);
    let local,foreign;
    try{await b.context().setOffline(true);await b.waitForTimeout(500);foreign=await localOnly(a,100);local=await localOnly(b,140);assert.ok(local.length&&foreign.length,'Both sides must commit while one is offline')}
    finally{await b.context().setOffline(false)}
    const ids=[...local,...foreign];for(const p of pages)await p.waitForFunction(ids=>ids.every(id=>__engine._log.entries.some(e=>e.op.id===id&&!e.pending)),ids,{timeout:45000});await idle();
    const ah=await historyReady(a,env.QA_BASE_URL,env.QA_ROOM),bh=await historyReady(b,env.QA_BASE_URL,env.QA_ROOM);assert.deepEqual(comparable(ah.journal),comparable(bh.journal),'Offline recovery changed causal material');
    await liveCheck('offline-recovery',id);await terminalDry(id);
  });
  if(selected.has('load'))await stage('normal-and-compact-annotation-rejoin',async()=>{const id=await layer('night-load');await stroke(a);await terminalDry(id);const note=await append(a,{type:'annotation_add',annotationId:'qa-note-'+crypto.randomUUID(),shape:{kind:'text',x:128,y:128,color:'#e5484d',size:16,text:'Night QA annotation'}});const expected=await journal(a);for(const viewport of [{width:1100,height:850},{width:390,height:844}]){const began=Date.now();await b.setViewportSize(viewport);await b.reload();await b.waitForFunction(()=>window.__engine&&!__engine._locked||document.querySelector('form input[type="text"]'));if(await b.locator('form input[type="text"]').count()){await b.locator('form input[type="text"]').first().fill('Night layer rejoin');await b.locator('form button[type="submit"]').click()}await b.waitForFunction(()=>window.__engine&&!__engine._locked);const restored=await historyReady(b,env.QA_BASE_URL,env.QA_ROOM);assert.deepEqual(comparable(restored.journal),comparable(expected),'Rejoin changed causal history');await b.evaluate(()=>__roomStore.getState().setAnnotationMode(true));report.loads.push({viewport,elapsedMs:Date.now()-began,annotationId:note,annotationMode:await b.evaluate(()=>__roomStore.getState().annotationMode)});await liveCheck('rejoin-'+viewport.width,id);await b.screenshot({path:env.QA_OUTPUT+'/rejoin-'+viewport.width+'.png'})}});
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
