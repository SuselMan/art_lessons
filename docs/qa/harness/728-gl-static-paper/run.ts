import {WatercolorPasses} from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {adaptDiagnosticWebgl2} from '../../../../apps/web/src/engine/src/raster/diagnosticWebgl2'
import type {StampPainter} from '../../../../apps/web/src/engine/src/dabs/StampPainter'
const diff=(a:Uint8Array,b:Uint8Array)=>{let changed=0,max=0,total=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=+(d>0);max=Math.max(max,d);total+=d}return{changed,max,total}}
/** Primitive actual WatercolorPasses; no changed model or alternate equations. */
export async function runGlStaticPaper({version=2,sizes=[[32,40],[31,29]],iterations=4}:{version?:1|2;sizes?:[number,number][];iterations?:number}={}){
 if(sizes.some(([w,h])=>w*h>1536*1536)||iterations>16)throw Error('bounded primitive exceeded')
 const rows=[]; const negativeControls=[]
 for(const [w,h] of sizes){
  const canvas=document.createElement('canvas');document.body.append(canvas);const context=canvas.getContext(version===2?'webgl2':'webgl',{antialias:false,preserveDrawingBuffer:true});if(!context)throw Error('GL unavailable');const gl=version===2?adaptDiagnosticWebgl2(context as WebGL2RenderingContext):context as WebGLRenderingContext
  const screen=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,screen);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
  const makeTex=(size:number,linear:boolean)=>{const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);const bytes=new Uint8Array(size*size*4);for(let i=0;i<bytes.length;i++)bytes[i]=(Math.imul(i+7,73)^Math.imul(i>>>4,31))&255;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,size===251?gl.CLAMP_TO_EDGE:gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,size===251?gl.CLAMP_TO_EDGE:gl.REPEAT);return t}
  const paper=makeTex(32,true),noise=makeTex(251,false),stamps={bindNoise(location:WebGLUniformLocation|null){gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,noise);gl.uniform1i(location,7);gl.activeTexture(gl.TEXTURE0)}} as unknown as StampPainter
  const ctx={gl:()=>gl,screenBuf:()=>screen,paperTex:()=>paper,paperScale:()=>1,paperWorldSize:()=>({w:1024,h:1024}),stamps:()=>stamps},passes=new WatercolorPasses(ctx);passes.initFieldPrograms();passes.initSettlePrograms();passes.initFieldUniforms();passes.initFieldAttributes();passes.initDiffusionAttributes()
  const src=new AccumulationBuffer(gl,w,h,'nearest'),coverage=new AccumulationBuffer(gl,w,h,'nearest'),baseline=new AccumulationBuffer(gl,w,h,'nearest'),candidate=new AccumulationBuffer(gl,w,h,'nearest');const all=[src,coverage,baseline,candidate]
  const upload=(target:AccumulationBuffer,bytes:Uint8Array)=>{gl.bindTexture(gl.TEXTURE_2D,target.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes)}
  const read=(b:AccumulationBuffer)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes}
  const ink=new Uint8Array(w*h*4);for(let i=0;i<ink.length;i++)ink[i]=(i*47+(i>>>3)*19)&255;upload(src,ink);const wet=new Uint8Array(w*h*4).fill(255);upload(coverage,wet)
  try{for(const kind of ['front','diffuse'] as const){for(let i=0;i<iterations;i++){
   // Changing origin mid-run is a meaningful strict-key invalidation gate.
   const x0=i<2?17.25:59.5,y0=-33.75,S=i%2?2:1,radius=1+(i%3)
   const run=(enabled:boolean,out:AccumulationBuffer)=>{passes.diagnosticStaticPaperCache=enabled;passes.diagnosticStaticPaperBudgetBytes=36*1024*1024;const f={w,h,coverage};if(kind==='front')passes.waterFrontStep(f,x0,y0,2,src,out,17,.72,.02,radius,S);else passes.diffuseStep(f,x0,y0,S,1024,1024,src,out,radius*S,i%2===1,coverage)}
   run(false,baseline);const a=read(baseline);run(true,candidate);const b=read(candidate);run(true,candidate);const repeated=read(candidate);rows.push({kind,w,h,iteration:i,x0,y0,S,radius,difference:diff(a,b),reuseDifference:diff(b,repeated),stats:passes.staticPaperCacheStats?{...passes.staticPaperCacheStats}:null,glError:gl.getError()})
  }}
   // Deliberately bypass invalidation: this must produce a difference, otherwise
   // the fixture would not detect a broken world-coordinate cache key.
   const cache=(passes as unknown as {_staticPaperCache:{ensure:(...args:unknown[])=>boolean}})._staticPaperCache
   const ensure=cache.ensure
   const changedWorld=(enabled:boolean,out:AccumulationBuffer)=>{passes.diagnosticStaticPaperCache=enabled;passes.diffuseStep({w,h,coverage},193.75,81.25,1,1024,1024,src,out,3,true,coverage)}
   changedWorld(false,baseline);const reference=read(baseline)
   try{cache.ensure=()=>true;changedWorld(true,candidate);negativeControls.push({w,h,difference:diff(reference,read(candidate))})}finally{cache.ensure=ensure}
  }finally{passes.destroy();all.forEach(b=>b.destroy());gl.deleteTexture(paper);gl.deleteTexture(noise);gl.deleteBuffer(screen);gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.remove()}
 }
 return{version,rows,negativeControls,negativeControlsMeaningful:negativeControls.every(r=>r.difference.changed>0),exact:rows.every(r=>r.difference.changed===0&&r.reuseDifference.changed===0&&r.glError===0),cacheActuallyUsed:rows.some(r=>r.stats&&r.stats.prepares>0),limitations:['Actual GL primitive, not whole Room/GPU time','Float32 cache optin; fallback must be separated from exercised cache proof','Neighbor Float32 coordinate coincidence is tested, not universally presumed']}
}
Object.assign(window,{runGlStaticPaper})
