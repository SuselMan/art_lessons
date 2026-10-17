// Native same-context sequential comparison. Never navigates an existing room.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('@playwright/test');
(async()=>{let browser,page;const output=process.env.QA_OUTPUT;fs.mkdirSync(output,{recursive:true});try{
 browser=await chromium.connectOverCDP(process.env.QA_CDP);const context=browser.contexts()[0];page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
 await page.goto(process.env.QA_BASE_URL);await page.waitForLoadState('domcontentloaded');
 if(process.env.QA_EXPORT_RGBA==='1')await page.evaluate(require('./rgba-export.cjs'));
 const result=await page.evaluate(async()=>{
  const [{PencilEngine},{AccumulationBuffer},{RibbonStrokeScratch},{ribbonProfileFor},{createNativePuddleTarget},{createPagedPuddleTarget},{createContrastPhase},{createBackgroundMix},{APPROVED_M70_PARAMETERS}]=await Promise.all([
   import('/src/engine/index.ts'),import('/src/engine/src/buffers/AccumulationBuffer.ts'),import('/src/engine/src/buffers/RibbonStrokeScratch.ts'),import('/src/engine/src/dabs/ribbonProfile.ts'),import('/src/engine/src/watercolor/puddle/PuddleTarget.ts'),import('/src/engine/src/watercolor/puddle/PagedPuddleTarget.ts'),import('/src/engine/src/watercolor/puddle/ContrastPhase.ts'),import('/src/engine/src/watercolor/puddle/BackgroundMix.ts'),import('/src/engine/src/watercolor/puddle/PuddleParameters.ts')]);
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;document.body.append(canvas);
  const e=new PencilEngine(canvas,{paper:'flat',pageWidth:1536,pageHeight:1536,watercolorModel:'m70-r2-v1',watercolorReview:true});await e.paperReady();
  const gl=e.gl,ext=gl.getExtension('WEBGL_debug_renderer_info'),renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;
  if(!renderer||/swiftshader|llvmpipe/i.test(renderer))throw Error('Native GPU required: '+renderer);
  const size=1536,bytes=size*size*4,planes={p:new Uint8Array(bytes),c:new Uint8Array(bytes),coverage:new Uint8Array(bytes),water:new Uint8Array(bytes)};
  const pools=[[15,15,42],[256,512,65],[640,768,85],[1000,1010,95],[1040,1040,90],[1508,1500,44]];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   let wet=0,a=0,b=0;for(let n=0;n<pools.length;n++){const [cx,cy,r]=pools[n],d=Math.hypot(x-cx,y-cy);if(d<r){wet=1;if(d<r*.8){if(n%2)a=1;else b=1}}}
   if(!wet)continue;const k=(y*size+x)*4;
   planes.coverage.set([128,80,255,255],k);planes.water[k+3]=64;
   const mass=48*(a+b);planes.p.set([0,0,mass,mass],k);planes.c.set([90*a+10*b,45*a+30*b,10*a+90*b,mass],k);
  }
  const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
  const inputHashes={};for(const[k,v]of Object.entries(planes))inputHashes[k]=await hash(v);
  const host={gl,settlePlan:e._settlePlan,pool:e._ribbonScratchPool,passes:e._watercolorPasses,invalidateFrontPaths:()=>e._watercolorPasses.invalidateFrontPaths(),hasActiveSettle:()=>!!e._settle};
  const qaScopes={pointFront:!!globalThis.__qa747PointFront,pointField:!!globalThis.__qa747PointField,pointDiffuse:!!globalThis.__qa747PointDiffuse,manualMode6:!!globalThis.__qa747ManualMode6};
  for(const method of ['waterFrontStep','fieldOp','diffuseStep']){const original=host.passes[method];host.passes[method]=function(...args){const selected=method==='waterFrontStep'&&qaScopes.pointFront?[args[4]]:method==='fieldOp'&&qaScopes.pointField?[args[1],args[2],args[5]?.c,args[5]?.d,args[5]?.e].filter(b=>!(args[3]===6&&!qaScopes.manualMode6&&b===args[5]?.d)):method==='diffuseStep'&&qaScopes.pointDiffuse?[args[6],args[10],args[11],args[12]].filter(b=>b&&b.width===args[0].w&&b.height===args[0].h):[];const previous=[];try{for(const b of new Set(selected.filter(Boolean))){previous.push([b,b._pointSampling]);b.setPointSampling(true)}return original.apply(this,args)}finally{for(const[b,was]of previous)b.setPointSampling(was)}}}
  const make=(w,h,f='nearest')=>new AccumulationBuffer(gl,w,h,f),preset='normal:95:34:PB29:round:wc@m70-r2-v1';
  async function solve(paged){
   const key=host.pool.acquire(size,size);key.clear();const source=new RibbonStrokeScratch(host.pool,true,true),entry=source.getOrCreate(key);
   entry.inkLoad.writePixels(planes.p);entry.inkColor.writePixels(planes.c);entry.coverage.writePixels(planes.coverage);
   entry.solventLoad=host.pool.acquire(size,size);entry.solventLoad.writePixels(planes.water);
   entry.foreignSolventLoad=host.pool.acquire(size,size);entry.foreignSolventLoad.clear();
   const tile={buffer:key,originX:0,originY:0,contentRect:null},target={allResident:()=>[tile]};
   source.paints.add('.1,.3,.8');source.paints.add('.9,.8,.1');
   source.noteFinish({target,preset:e._resolvePreset('watercolor',preset),profile:ribbonProfileFor('watercolor',preset),color:[.1,.3,.8],opacity:1,bounds:{minX:0,minY:0,maxX:size,maxY:size},fieldSeed:[0,0],landedWet:0,wetPeak:1,radiusPx:40,dwellMs:0});
   source.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:1,migratePx:0,fieldSeed:[0,0],bristleRadiusPx:0}));
   let solver,ownedContrast,ownedBackground;const stages={},read=()=>APPROVED_M70_PARAMETERS;
   const assemble=(name,rect,buffer)=>{stages[name]??=new Uint8Array(bytes);const pixels=buffer.readPixels();for(let y=0;y<rect.height;y++)stages[name].set(pixels.subarray(y*rect.width*4,(y+1)*rect.width*4),((rect.y+y)*size+rect.x)*4)};
   const at=performance.now();try{
    if(paged)solver=createPagedPuddleTarget(host,{width:size,height:size},make,{
     reference(rect,p,c){assemble('referenceP',rect,p);assemble('referenceC',rect,c)},
     solved(p,c,coverage){const rect={x:0,y:0,width:size,height:size};stages.solvedP=p.readRect(rect);stages.solvedC=c.readRect(rect);stages.solvedCoverage=coverage.readRect(rect)},
     coarse(value){for(const[k,v]of Object.entries(value))stages['coarse:'+k]=v},
    });else{
     ownedContrast=createContrastPhase(gl,read,size);ownedBackground=createBackgroundMix(gl,size,read,true);
     solver=createNativePuddleTarget(host,size,{portableNoise:true,contrast:{...ownedContrast,prepare(...args){ownedContrast.prepare(...args);stages.referenceP=args[4].readPixels();stages.referenceC=args[5].readPixels()},destroy(){}},background:{...ownedBackground,ops(...args){return[()=>{stages.solvedP=args[0].readPixels();stages.solvedC=args[1].readPixels();stages.solvedCoverage=args[2].readPixels()},...ownedBackground.ops(...args)]},destroy(){}}});
    }
    solver.resetFromScratch(source,paged?target:tile,1);
    let steps=0;while(!solver.state.done){solver.step(4);if(++steps%32===0)await new Promise(r=>setTimeout(r,0));if(steps>50000)throw Error('Solver did not finish')}
    if(!solver.dry())throw Error('Dry refused');const material=paged?solver.buffers(tile):solver.buffers();
    const out={p:material.p.readPixels(),c:material.c.readPixels(),coverage:material.coverage.readPixels()};
    if(!paged)for(const[k,v]of Object.entries(ownedBackground.readback()))stages['coarse:'+k]=v;return{out,stages,ms:performance.now()-at,steps,gl:gl.getError()};
   }finally{solver?.destroy();ownedContrast?.destroy();ownedBackground?.destroy();source.destroy();host.pool.release(key)}
  }
  try{
   const reference=await solve(false);let referenceDestroyedBuffers=0;e._settlePlan.destroyTextures();for(const field of e._fieldCache){for(const key of ['a','b','c','coverage','ca','cb','cc','mask','pressure','band']){const b=field[key],texture=b._texture;b.destroy();if(b._destroyed!==true||gl.isTexture(texture))throw Error('Reference texture not destroyed '+key);referenceDestroyedBuffers++}}e._fieldCache=[];if(referenceDestroyedBuffers!==10)throw Error('Expected exactly ten reference field buffers');const actual=await solve(true),diffs={};
   for(const name of ['p','c','coverage']){const a=actual.out[name],b=reference.out[name];let changed=0,max=0;const first=[];for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d){changed++;if(first.length<8)first.push({x:Math.floor(i/4)%size,y:Math.floor(i/4/size),channel:i%4,a:a[i],b:b[i]})}max=Math.max(max,d)}diffs[name]={changed,max,first,actualHash:await hash(a),referenceHash:await hash(b)}}
   const stageDiffs={};for(const name of Object.keys(reference.stages)){const a=actual.stages[name],b=reference.stages[name];if(!a||a.length!==b.length)throw Error('Stage length mismatch '+name);let changed=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)changed++;max=Math.max(max,d)}stageDiffs[name]={changed,max,actualHash:await hash(a),referenceHash:await hash(b)}}
   const rgbaExports=globalThis.__qa747ExportRGBA?await globalThis.__qa747ExportRGBA({referenceP:reference.out.p,referenceC:reference.out.c,actualP:actual.out.p,actualC:actual.out.c}):undefined;
   return{rgbaExports,referenceDestroyedBuffers,qaScopes,stageDiffs,renderer,size,sourceLocation:location.origin,inputHashes,reference:{ms:reference.ms,steps:reference.steps,gl:reference.gl},actual:{ms:actual.ms,steps:actual.steps,gl:actual.gl},diffs,lost:gl.isContextLost(),sequential:true};
  }finally{e.destroy()}
 });
 const report={source:process.env.QA_SOURCE,...result,errors};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.equal(errors.length,0);assert.equal(result.reference.gl,0);assert.equal(result.actual.gl,0);assert.equal(result.lost,false);
 for(const d of Object.values(result.diffs))assert.equal(d.changed,0,'Material A/B difference');
 }finally{if(page)await page.close();if(browser)await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
