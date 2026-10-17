// QA-only independent full-domain reference versus paged, nonzero window origins.
// Creates only its own page. Run only when the device QA operator authorizes it.
// Required: QA_CDP, QA_BASE_URL, QA_OUTPUT; optional QA_SOURCE.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('@playwright/test');
(async()=>{let browser,page;const output=process.env.QA_OUTPUT;fs.mkdirSync(output,{recursive:true});try{
 browser=await chromium.connectOverCDP(process.env.QA_CDP);const context=browser.contexts()[0];page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
 await page.goto(process.env.QA_BASE_URL);await page.waitForLoadState('domcontentloaded');
 const result=await page.evaluate(async()=>{
  const [{PencilEngine},{AccumulationBuffer},{RibbonStrokeScratch},{ribbonProfileFor},{createNativePuddleTarget},{createPagedPuddleTarget},{createContrastPhase},{createBackgroundMix},{APPROVED_M70_PARAMETERS}]=await Promise.all([
   import('/src/engine/index.ts'),import('/src/engine/src/buffers/AccumulationBuffer.ts'),import('/src/engine/src/buffers/RibbonStrokeScratch.ts'),import('/src/engine/src/dabs/ribbonProfile.ts'),import('/src/engine/src/watercolor/puddle/PuddleTarget.ts'),import('/src/engine/src/watercolor/puddle/PagedPuddleTarget.ts'),import('/src/engine/src/watercolor/puddle/ContrastPhase.ts'),import('/src/engine/src/watercolor/puddle/BackgroundMix.ts'),import('/src/engine/src/watercolor/puddle/PuddleParameters.ts')]);
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;document.body.replaceChildren(canvas);
  const e=new PencilEngine(canvas,{paper:'flat',pageWidth:2048,pageHeight:512,watercolorModel:'m70-r2-v1',watercolorReview:true});await e.paperReady();
  let referencePlan,blobURL;const referenceFields=new Set(),referenceFieldGeometry=[];
  try{
  const gl=e.gl,ext=gl.getExtension('WEBGL_debug_renderer_info'),renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;
  if(!renderer||/swiftshader|llvmpipe/i.test(renderer))throw Error('Native GPU required: '+renderer);
  const W=2048,H=512,size={width:W,height:H},domain={width:2048,height:1536},bytes=W*H*4,planes={p:new Uint8Array(bytes),c:new Uint8Array(bytes),coverage:new Uint8Array(bytes),water:new Uint8Array(bytes)};
  const pools=[[8,256,42],[640,242,65],[1024,272,85],[1280,247,75],[1536,270,80],[2010,250,60],[2040,256,42],[640,8,36],[1536,504,36]];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   // A single connected wet strip crosses every window origin and halo/gather
   // region. Two pigments overlap around x1024; asymmetric edge pools expose Y.
   const strip=Math.abs(y-(256+16*Math.sin(x/73)))<24;
   let wet=strip?1:0,a=strip&&x<1080?1:0,b=strip&&x>920?1:0;
   for(let n=0;n<pools.length;n++){const [cx,cy,r]=pools[n],d=Math.hypot(x-cx,y-cy);if(d<r){wet=1;if(d<r*.8){if(n%2)a=1;else b=1}}}
   if(!wet)continue;const k=(y*W+x)*4;
   planes.coverage.set([128,80,255,255],k);planes.water[k+3]=64;
   const mass=48*(a+b);planes.p.set([0,0,mass,mass],k);planes.c.set([90*a+10*b,45*a+30*b,10*a+90*b,mass],k);
  }
  const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
  const inputHashes={};for(const[k,v]of Object.entries(planes))inputHashes[k]=await hash(v);
  const response=await fetch('/src/engine/src/raster/WatercolorSettlePlan.ts');
  if(!response.ok)throw Error('Cannot fetch transformed reference Plan: '+response.status);
  const transformed=await response.text(),cap=/const CAP = 1536 \* S/g;
  if([...transformed.matchAll(cap)].length!==1)throw Error('QA reference CAP1536 pattern must occur exactly once');
  let patched=transformed.replace(cap,'const CAP = 4096 * S');
  // Blob modules have no HTTP base URL. Resolve every root-relative module
  // specifier, including Vite client/dependency paths, against this exact origin.
  patched=patched.replace(/((?:from\s*|import\s*\(\s*|import\s*)["'])(\/[^"']+)(["'])/g,(_all,prefix,url,quote)=>prefix+new URL(url,location.origin).href+quote);
  if(/(?:from\s*|import\s*\(\s*|import\s*)["']\/src\//.test(patched))throw Error('Unresolved /src import in QA reference module');
  const patch={module:response.url,originalHash:await hash(new TextEncoder().encode(transformed)),patchedHash:await hash(new TextEncoder().encode(patched)),replacement:'unique const CAP = 1536 * S → const CAP = 4096 * S',productionChanged:false};
  blobURL=URL.createObjectURL(new Blob([patched],{type:'text/javascript'}));
  const {WatercolorSettlePlan:ReferencePlan}=await import(/* @vite-ignore */ blobURL);
  referencePlan=new ReferencePlan({...e._settlePlan.ctx,fieldFor:(w,h,S,compact)=>{const field=e._diffuseFieldFor(w,h,S,compact,1536);referenceFields.add(field);referenceFieldGeometry.push({requested:{w,h,scale:S,compact},allocated:{width:field.w,height:field.h}});return field}});
  const {m70WindowGroups}=await import('/src/engine/src/watercolor/puddle/M70WindowGroups.ts');
  const windowGeometry=m70WindowGroups(size,domain,612).map(group=>({field:group.field,cores:group.cores}));
  const origins=[...new Set(windowGeometry.map(group=>group.field.x))];
  for(const x of [128,384,512])if(!origins.includes(x))throw Error('Nonzero origin fixture does not exercise '+x);
  const host={gl,settlePlan:e._settlePlan,pool:e._ribbonScratchPool,passes:e._watercolorPasses,invalidateFrontPaths:()=>e._watercolorPasses.invalidateFrontPaths(),hasActiveSettle:()=>!!e._settle};
  const make=(w,h,f='nearest')=>new AccumulationBuffer(gl,w,h,f),preset='normal:95:34:PB29:round:wc@m70-r2-v1';
  async function solve(paged){
   let key,source,solver,ownedContrast,ownedBackground;
   const stages={},read=()=>APPROVED_M70_PARAMETERS,at=performance.now();
   try{
   key=host.pool.acquire(W,H);key.clear();source=new RibbonStrokeScratch(host.pool,true,true);const entry=source.getOrCreate(key);
   entry.inkLoad.writePixels(planes.p);entry.inkColor.writePixels(planes.c);entry.coverage.writePixels(planes.coverage);
   entry.solventLoad=host.pool.acquire(W,H);entry.solventLoad.writePixels(planes.water);
   entry.foreignSolventLoad=host.pool.acquire(W,H);entry.foreignSolventLoad.clear();
   const tile={buffer:key,originX:0,originY:0,contentRect:null},target={allResident:()=>[tile]};
   source.paints.add('.1,.3,.8');source.paints.add('.9,.8,.1');
   source.noteFinish({target,preset:e._resolvePreset('watercolor',preset),profile:ribbonProfileFor('watercolor',preset),color:[.1,.3,.8],opacity:1,bounds:{minX:0,minY:0,maxX:W,maxY:H},fieldSeed:[0,0],landedWet:0,wetPeak:1,radiusPx:40,dwellMs:0});
   source.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:1,migratePx:0,fieldSeed:[0,0],bristleRadiusPx:0}));
   const assemble=(name,rect,buffer)=>{stages[name]??=new Uint8Array(bytes);const pixels=buffer.readPixels();for(let y=0;y<rect.height;y++)stages[name].set(pixels.subarray(y*rect.width*4,(y+1)*rect.width*4),((rect.y+y)*W+rect.x)*4)};
    if(paged)solver=createPagedPuddleTarget(host,size,make,{
     reference(rect,p,c){assemble('referenceP',rect,p);assemble('referenceC',rect,c)},
     solved(p,c,coverage){const rect={x:0,y:0,...size};stages.solvedP=p.readRect(rect);stages.solvedC=c.readRect(rect);stages.solvedCoverage=coverage.readRect(rect)},
     coarse(value){for(const[k,v]of Object.entries(value))stages['coarse:'+k]=v},
    });else{
     ownedContrast=createContrastPhase(gl,read,size);ownedBackground=createBackgroundMix(gl,size,read,true);
     solver=createNativePuddleTarget({...host,settlePlan:referencePlan},size,{portableNoise:true,contrast:{...ownedContrast,prepare(...args){ownedContrast.prepare(...args);stages.referenceP=args[4].readPixels();stages.referenceC=args[5].readPixels()},destroy(){}},background:{...ownedBackground,ops(...args){return[()=>{stages.solvedP=args[0].readPixels();stages.solvedC=args[1].readPixels();stages.solvedCoverage=args[2].readPixels()},...ownedBackground.ops(...args)]},destroy(){}}});
    }
    solver.resetFromScratch(source,paged?target:tile,1);
    let steps=0;while(!solver.state.done){solver.step(4);if(++steps%32===0)await new Promise(r=>setTimeout(r,0));if(steps>50000)throw Error('Solver did not finish')}
    if(!solver.dry())throw Error('Dry refused');const material=paged?solver.buffers(tile):solver.buffers();
    const out={p:material.p.readPixels(),c:material.c.readPixels(),coverage:material.coverage.readPixels()};
    if(!paged)for(const[k,v]of Object.entries(ownedBackground.readback()))stages['coarse:'+k]=v;return{out,stages,ms:performance.now()-at,steps,gl:gl.getError()};
   }finally{
    try{solver?.destroy()}finally{try{ownedContrast?.destroy()}finally{try{ownedBackground?.destroy()}finally{
     try{source?.destroy()}finally{if(key)host.pool.release(key);host.pool.trimFree()}
     if(!paged){
      referencePlan.destroyTextures();referencePlan=null;
      // _diffuseFieldFor owns these fields separately from Plan prefixes.
      for(const field of referenceFields)for(const value of Object.values(field))if(value instanceof AccumulationBuffer)value.destroy();
      e._fieldCache=e._fieldCache.filter(field=>!referenceFields.has(field));referenceFields.clear();
     }
    }}}
   }
  }
   const reference=await solve(false);
   if(!referenceFieldGeometry.length||referenceFieldGeometry.some(field=>field.allocated.width!==domain.width||field.allocated.height!==domain.height))throw Error('Reference did not cover the independent full domain');
   if(referenceFields.size||referencePlan)throw Error('Reference GPU resources were not released before actual');
   const actual=await solve(true),diffs={};
   for(const name of ['p','c','coverage']){const a=actual.out[name],b=reference.out[name];let changed=0,max=0;const first=[];for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d){changed++;if(first.length<8)first.push({x:Math.floor(i/4)%W,y:Math.floor(i/4/W),channel:i%4,a:a[i],b:b[i]})}max=Math.max(max,d)}diffs[name]={bytes:a.length,changed,max,first,actualHash:await hash(a),referenceHash:await hash(b)}}
   const expectedStages=['referenceP','referenceC','solvedP','solvedC','solvedCoverage','coarse:gate','coarse:beforeP','coarse:afterP','coarse:beforeC','coarse:afterC'].sort();
   for(const result of [reference,actual])if(JSON.stringify(Object.keys(result.stages).sort())!==JSON.stringify(expectedStages))throw Error('Incomplete stage capture');
   const stageDiffs={};for(const name of Object.keys(reference.stages)){const a=actual.stages[name],b=reference.stages[name];if(!a||a.length!==b.length)throw Error('Stage length mismatch '+name);let changed=0,max=0;const first=[];for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d){changed++;if(first.length<8)first.push({byte:i,channel:i%4,a:a[i],b:b[i]})}max=Math.max(max,d)}stageDiffs[name]={bytes:a.length,changed,max,first,actualHash:await hash(a),referenceHash:await hash(b)}}
   const finalInputHashes={};for(const[k,v]of Object.entries(planes)){finalInputHashes[k]=await hash(v);if(finalInputHashes[k]!==inputHashes[k])throw Error('Immutable input changed '+k)}
   return{stageDiffs,renderer,size,domain,windowGeometry,origins,referenceFieldGeometry,referenceReleasedBeforeActual:true,patch,finalInputHashes,sourceLocation:location.origin,inputHashes,reference:{ms:reference.ms,steps:reference.steps,gl:reference.gl},actual:{ms:actual.ms,steps:actual.steps,gl:actual.gl},diffs,lost:gl.isContextLost(),sequential:true};
  }finally{try{referencePlan?.destroyTextures()}finally{if(blobURL)URL.revokeObjectURL(blobURL);e.destroy()}}
 });
 const report={source:process.env.QA_SOURCE,...result,errors};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.equal(errors.length,0);assert.equal(result.reference.gl,0);assert.equal(result.actual.gl,0);assert.equal(result.lost,false);
 for(const d of Object.values(result.diffs))assert.equal(d.changed,0,'Material A/B difference');
 for(const [name,d]of Object.entries(result.stageDiffs))assert.equal(d.changed,0,'Stage A/B difference '+name);
 }finally{if(page)await page.close();if(browser)await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
