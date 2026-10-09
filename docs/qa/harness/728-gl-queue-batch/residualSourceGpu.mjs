import{PreviewInitialMomentPool,RESIDUAL_MULTISCALE_BYTES}from'./PreviewInitialMomentPool.mjs';
import{createPreviewManualMaterial}from'./PreviewManualMaterial.mjs';
/** Tiny source-only t0 gate. No Room, FIFO, settle, movie or latency assertion. */
export async function runResidualSourceGpu(){
 const[{PencilEngine},{RibbonStrokeScratch},{ribbonProfileFor},{AccumulationBuffer}]=await Promise.all([import('/src/engine/index.ts'),import('/src/engine/src/buffers/RibbonStrokeScratch.ts'),import('/src/engine/src/dabs/ribbonProfile.ts'),import('/src/engine/src/buffers/AccumulationBuffer.ts')]);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;document.querySelector('#surface').replaceChildren(canvas);
 const e=new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'residual-source-qa'});let scratch,pool,mobile,initial,fixed,manual,originalDraw;const owned=[],stages=[];
 const checkpoint=name=>{const error=e.gl.getError();stages.push({name,error});if(error)throw Error(name+' GL '+error)};
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const compare=(a,b)=>{let changed=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=d!==0;max=Math.max(max,d)}return{changed,max,exact:changed===0}};
 try{
  await e.paperReady();e.initLayer('L');const painter=e._ribbonPainter,ctx=painter.ctx;originalDraw=ctx.drawRibbonCompositeRect;let captured;
  ctx.drawRibbonCompositeRect=(...args)=>{captured=args;return originalDraw.apply(ctx,args)};
  painter.diagnosticSegmentDelivery='combined';painter.diagnosticSolventField=true;painter.diagnosticForeignSolvent=false;painter.diagnosticPigmentRecord=true;
  scratch=new RibbonStrokeScratch(e._ribbonScratchPool,true,true);
  for(const[size,pigment]of[[400,0],[70,100]]){const name=`normal:100:${pigment}:PB29:round`,preset=e._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name,0);const dabs=[{x:512,y:512,size,pressure:1,aspectRatio:1,angle:0,opacity:1,tiltX:0,tiltY:0,t:0}];for(const _ of painter.paint(e._layers.get('L'),dabs,preset,name,profile,[.2,.1,.5],scratch,undefined,'0f37',[1,2]))void _}
  if(!captured||!captured[6]||!captured[7])throw Error('Actual P/C composite capture absent');checkpoint('actual-source');
  const sourceP=captured[6],sourceC=captured[7],target=captured[0].buffer;
  pool=new PreviewInitialMomentPool(e.gl,{budgetBytes:RESIDUAL_MULTISCALE_BYTES,excluded:[sourceP,sourceC,target,captured[4],captured[5]]});mobile=pool.take();initial=pool.take();fixed=pool.take();checkpoint('float-allocation');
  for(const[out,src]of[[mobile.fields.p,sourceP],[mobile.fields.c,sourceC]])e._watercolorPasses.wcResample(out,0,0,128,128,src,0,0,8,0);checkpoint('production-resample');
  initial.initialize(mobile.fields.p,mobile.fields.c);checkpoint('immutable-initial-copy');
  for(const f of Object.values(fixed.fields)){e.gl.bindFramebuffer(e.gl.FRAMEBUFFER,f.fbo);e.gl.disable(e.gl.SCISSOR_TEST);e.gl.colorMask(true,true,true,true);e.gl.clearColor(0,0,0,0);e.gl.clear(e.gl.COLOR_BUFFER_BIT)}checkpoint('fixed-zero');
  manual=await createPreviewManualMaterial(e._ribbonPasses,{finiteSettling:true,residualMaterial:true});checkpoint('residual-compile');
  const out=new AccumulationBuffer(e.gl,1024,1024,'nearest');owned.push(out);const tile={...captured[0],buffer:out};const args=[...captured];args[0]=tile;
  captured[4].copyTo(out);e._ribbonPasses.drawRibbonCompositeRect(...args);checkpoint('original-draw');
  const roi=new AccumulationBuffer(e.gl,64,64,'nearest');owned.push(roi);out.copyRegionInto(roi,480,480,0,0,64,64);checkpoint('original-roi-copy');
  const original=roi.readPixels();checkpoint('original-read');const sourceRoi=new AccumulationBuffer(e.gl,64,64,'nearest');owned.push(sourceRoi);sourceP.copyRegionInto(sourceRoi,480,480,0,0,64,64);const sourceBefore=sourceRoi.readPixels();checkpoint('source-before-read');
  captured[4].copyTo(out);manual.bindResidual(sourceP,sourceC,initial.fields.p,initial.fields.c);manual.bindFixed(fixed.fields.p,fixed.fields.c,1);args[6]=mobile.fields.p;args[7]=mobile.fields.c;
  manual.passes.drawRibbonCompositeRect(...args);checkpoint('residual-draw');out.copyRegionInto(roi,480,480,0,0,64,64);checkpoint('residual-roi-copy');
  e.gl.finish();const residual=roi.readPixels();checkpoint('residual-read');
  const copied=[];for(const role of ['p','c']){const arrays=[];for(const f of[mobile.fields[role],initial.fields[role]]){const a=new Float32Array(128*128*4);e.gl.bindFramebuffer(e.gl.FRAMEBUFFER,f.fbo);e.gl.readPixels(0,0,128,128,e.gl.RGBA,e.gl.FLOAT,a);checkpoint('float-read-'+role);if(a.some(v=>!Number.isFinite(v)))throw Error('Nonfinite initial');arrays.push(new Uint8Array(a.buffer))}copied.push({role,...compare(...arrays),nonzero:arrays[0].reduce((n,v)=>n+(v!==0),0),sha:await hash(arrays[0])})}
  sourceP.copyRegionInto(sourceRoi,480,480,0,0,64,64);const sourceAfter=sourceRoi.readPixels();checkpoint('source-after-read');const originalNonzero=original.reduce((n,v)=>n+(v!==0),0),sourceNonzero=sourceBefore.reduce((n,v)=>n+(v!==0),0);const result={originalNonzero,sourceNonzero,sourceUnchanged:compare(sourceBefore,sourceAfter),sourceSha:await hash(sourceBefore),scope:'Actual source-only SAME captured production composite, no Room/settle/movie proof',spacing:captured[14],stages,copies:copied,pixels:compare(original,residual),originalSha:await hash(original),residualSha:await hash(residual),readBytes:4*16384+4*128*128*16,lost:e.gl.isContextLost(),samplers:e.gl.getParameter(e.gl.MAX_TEXTURE_IMAGE_UNITS)};
  if(result.lost||!originalNonzero||!sourceNonzero||!copied.every(v=>v.exact&&v.nonzero)||!result.pixels.exact||!result.sourceUnchanged.exact)result.pass=false;else result.pass=true;return result;
 }catch(error){return{pass:false,error:String(error),stages,scope:'Source-only failed diagnostic; no equivalence claim'}}finally{if(originalDraw)e._ribbonPainter.ctx.drawRibbonCompositeRect=originalDraw;if(!e.gl.isContextLost())e.gl.finish();manual?.disposeAfterFence();for(const lease of[mobile,initial,fixed])lease?.releaseAfterKnownIdle();pool?.disposeAfterKnownIdle();for(const f of owned)f.destroy();scratch?.destroy();e.destroy();canvas.remove()}
}
