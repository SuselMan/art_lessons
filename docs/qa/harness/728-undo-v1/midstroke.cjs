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
const report={scope:'Actual local split gesture across peer Dry; live target versus replay, real GPU only.',cases:[],errors:[]};
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
  const idle=async()=>{for(const p of pages)await p.waitForFunction(()=>{const e=__engine;return !e._locked&&!e._contextLost&&!e._pendingRebuilds.size&&!e._rebuildJobs.size&&!e._opQueue.length&&!e._puddle?.state.pending&&!e._wcCanonical.pending&&!e._settle},null,{timeout:45000})};
  const sync=async(p)=>{const id=await p.evaluate(()=>__engine.getOperations().at(-1)?.id);console.log('SYNC',id);for(const peer of pages)await peer.waitForFunction(id=>__engine.getOperations().some(o=>o.id===id),id,{timeout:20000});await idle();return id};
  const append=async(p,draft)=>{const id=await p.evaluate(draft=>{const op={...draft,id:crypto.randomUUID(),userId:__roomStore.getState().userId,timestamp:Date.now()};__engine.appendOperation(op);return op.id},draft);await sync(p);return id};

  const lid='qa-'+crypto.randomUUID();await append(a,{type:'layer_add',layerId:lid,name:'midstroke-dry'});
  for(const p of pages){await p.evaluate(id=>{const s=__roomStore.getState();s.setLayerStateLocal(prev=>({...prev,activeId:id}));__engine.setActiveLayer(id);s.setTool('watercolor');for(const[k,v]of Object.entries({size:35,water:1,pigment:.65,pressureResponse:'normal',nib:'round',color:[.15,.35,.8]}))s.setToolSetting('watercolor',k,v)},lid);await p.waitForFunction(()=>__engine._opts.tool==='watercolor')}
  const prefixId=await a.evaluate(()=>{const e=__engine;let t=1000;const p=x=>({x,y:128,pressure:.8,tiltX:0,tiltY:0,speed:.4,pointerType:'pen',timeStamp:t+=16});e._onStart(p(70));if(e._dwellTimer){clearInterval(e._dwellTimer);e._dwellTimer=null}if(!e._strokeId)throw Error('Local gesture refused');for(let x=78;x<=118;x+=8)e._onMove(p(x));e._flushStrokeChunk();const op=e.getOperations().filter(o=>o.type==='stroke').at(-1);if(!op)throw Error('Prefix absent');return op.id});
  // Do not call idle while the pen is held: presentation deliberately waits.
  await a.waitForFunction(id=>{const e=__engine._log.entries.find(e=>e.op.id===id);return e&&!e.pending},prefixId);
  await b.waitForFunction(id=>__engine.getOperations().some(o=>o.id===id),prefixId);
  const dryId=await b.evaluate(layerId=>{const op={id:crypto.randomUUID(),type:'paper_dry',layerId,userId:__roomStore.getState().userId,timestamp:Date.now()};__engine.appendOperation(op);return op.id},lid);
  await a.waitForFunction(id=>__engine.getOperations().some(o=>o.id===id),dryId);
  const held=await a.evaluate(()=>({stroke:__engine._strokeId,rebuildAtPenUp:[...__engine._puddleRebuildAtPenUp]}));assert.ok(held.stroke);assert.ok(held.rebuildAtPenUp.includes(lid),'Dry must schedule canonical rebuild');
  await a.evaluate(()=>{const e=__engine;let t=1300;const p=x=>({x,y:128,pressure:.8,tiltX:0,tiltY:0,speed:.4,pointerType:'pen',timeStamp:t+=16});for(let x=126;x<=174;x+=8)e._onMove(p(x));e._onEnd(p(182))});
  await sync(a);
  const history=await a.evaluate(()=>__engine.getOperations());const first=history.find(o=>o.id===prefixId),di=history.findIndex(o=>o.id===dryId),tail=history.find((o,i)=>i>di&&o.type==='stroke'&&o.strokeId===first.strokeId);assert.ok(tail,'Remainder must follow Dry in journal');assert.ok(history.findIndex(o=>o.id===prefixId)<di);
  report.cases.push({name:'ordered-split-gesture',prefix:prefixId,dry:dryId,remainder:tail.id,strokeId:first.strokeId,held});
  // Fresh local gesture has no operation ID until commit. It must open/join
  // the post-Dry wet source rather than select the first chunk of old gesture.
  await a.evaluate(()=>{const e=__engine;let t=1600;const p=x=>({x,y:128,pressure:.8,tiltX:0,tiltY:0,speed:.4,pointerType:'pen',timeStamp:t+=16});e._onStart(p(160));if(e._dwellTimer){clearInterval(e._dwellTimer);e._dwellTimer=null}for(let x=168;x<=208;x+=8)e._onMove(p(x));e._onEnd(p(216))});await sync(a);
  for(const [i,p]of pages.entries())assert.ok(await p.evaluate(id=>{const e=__engine;return !!e._puddle?.has(e._layers.get(id))},lid),'Post-Dry source must remain wet on page '+i);
  report.cases.push({name:'post-dry-unrecorded-local-gesture-wet'});
  const captures=[];
  for(const [i,p]of pages.entries()){
    // Read actual live tile FIRST. Full replay is only the independent oracle.
    const result=await p.evaluate(id=>{const e=__engine,target=e._layers.get(id);e._puddle?.close(target);const live=target.allResident().map(t=>({x:t.originX,y:t.originY,w:t.buffer.width,h:t.buffer.height,p:Array.from(t.buffer.readPixels())}));const bytes=e.bakeLayerByFullReplay(id);if(!bytes)throw Error('No replay result');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=v.getUint32(0,true),replay=[];let offset=4;for(let n=0;n<count;n++){const x=v.getInt32(offset,true),y=v.getInt32(offset+4,true),w=v.getUint32(offset+8,true),h=v.getUint32(offset+12,true);offset+=16;replay.push({x,y,w,h,p:Array.from(bytes.subarray(offset,offset+w*h*4))});offset+=w*h*4}return{live,replay,error:e.gl.getError()}},lid);
    assert.equal(result.error,0);let changed=0,max=0;assert.equal(result.live.length,result.replay.length);for(const tile of result.live){const oracle=result.replay.find(t=>t.x===tile.x&&t.y===tile.y);assert.ok(oracle);assert.equal(tile.p.length,oracle.p.length);for(let j=0;j<tile.p.length;j++){const d=Math.abs(tile.p[j]-oracle.p[j]);if(d)changed++;max=Math.max(max,d)}}
    const hash=tiles=>crypto.createHash('sha256').update(Buffer.from(tiles.flatMap(t=>t.p))).digest('hex');captures.push({author:i,changedBytes:changed,maxDiff:max,liveHash:hash(result.live),replayHash:hash(result.replay)});assert.equal(changed,0,'Live versus replay mismatch on page '+i);
  }
  assert.equal(captures[0].liveHash,captures[1].liveHash,'Two authors actual live target mismatch');report.cases.push({name:'live-target-equals-fresh-replay',captures});assert.deepEqual(report.errors,[]);report.pass=true;

})().catch(async error=>{report.pass=false;report.failure=error.stack;process.exitCode=1;for(const[i,c]of contexts.entries())for(const p of c.pages())try{report['diagnostic'+i]=await p.evaluate(()=>({text:document.body.innerText.slice(0,1200),puddle:window.__engine?__engine._puddle?.state:null,operations:window.__engine?__engine.getOperations().map(o=>({id:o.id,type:o.type,seq:o.seq,layerId:o.layerId,strokeId:o.strokeId})):null}));await p.screenshot({path:env.QA_OUTPUT+'/failure-'+i+'.png',timeout:10000})}catch(e){report['diagError'+i]=e.message}}).finally(async()=>{await Promise.allSettled(contexts.map(c=>c.close()));if(browser)await browser.close().catch(()=>{});fs.writeFileSync(env.QA_OUTPUT+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,failure:report.failure}))});
