import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {RibbonStrokeScratch} from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import {captureNativePaperHeight} from '../805-algorithm-search/webgpu/native-capture-gl'
const hash=async(a:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a as Uint8Array<ArrayBuffer>)),x=>x.toString(16).padStart(2,'0')).join('')
/** QA forward construction, never an inverse of the native capture converter. */
export function constructNativeSeed(size:number,bytes:Uint8Array){
 const n=size*size;if(size!==1024||bytes.length!==n*6)throw Error('Seed requires exact1024 six-plane common input')
 const rgba=bytes.subarray(0,n*4),water=bytes.subarray(n*4,n*5),paper=bytes.subarray(n*5),planes=Object.fromEntries(['c','p','coverage','solvent','foreign','paper','original'].map(k=>[k,new Uint8Array(n*4)])) as Record<string,Uint8Array>
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x,j=((size-1-y)*size+x)*4,a=rgba[i*4+3],w=water[i];planes.c.set(rgba.subarray(i*4,i*4+4),j);planes.p.set([Math.round(a*w/255),Math.round(a*w/255),a,a],j);planes.coverage.set(a||w?[128,0,w,255]:[0,0,0,0],j);planes.solvent[j+3]=w;planes.paper.set([paper[i],0,0,255],j)}
 return{planes,rgba,water,paper}
}
export async function createNativeCommonSeed(engine:any,controller:any,bytes:Uint8Array,seed:number,sourceEncoding:string,sourceDisplayDensityScale=1){
 if(!['optical-density','premultiplied-rgb'].includes(sourceEncoding))throw Error('Explicit common source encoding required')
 if(!Number.isFinite(sourceDisplayDensityScale)||sourceDisplayDensityScale<=0||sourceDisplayDensityScale>1)throw Error('Invalid source display density scale')
 if(!Number.isSafeInteger(seed))throw Error('Explicit common seed required')
 const size=1024,n=size*size,data=constructNativeSeed(size,bytes),anchor=controller.diagnosticSource(),gl:WebGLRenderingContext=engine.gl,ctx=engine._watercolorPasses.ctx
 const source=new RibbonStrokeScratch(engine._ribbonScratchPool,true,true),paper=new AccumulationBuffer(gl,size,size),entry=source.getOrCreate(anchor.tile.buffer)
 let installed=false,destroyed=false
 const withPaper=<T>(fn:()=>T):T=>{
  const old={paperTex:ctx.paperTex,paperWorldSize:ctx.paperWorldSize,paperScale:ctx.paperScale},keys=['_paperTex','_paperWorldSize','_opts'],descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(engine,k)),opts=engine._opts
  try{
   Object.defineProperties(engine,{_paperTex:{value:paper.texture,configurable:true},_paperWorldSize:{value:()=>({w:size,h:size}),configurable:true},_opts:{value:{...opts,paperScale:1},configurable:true}})
   ctx.paperTex=()=>paper.texture;ctx.paperWorldSize=()=>({w:size,h:size});ctx.paperScale=()=>1
   engine._paperCacheKey='';engine._paperPartialOK=false;engine._invalidateSplitCache();return fn()
  }finally{
   Object.assign(ctx,old);keys.forEach((key,i)=>{if(descriptors[i])Object.defineProperty(engine,key,descriptors[i]!);else delete engine[key]})
   engine._paperCacheKey='';engine._paperPartialOK=false;engine._invalidateSplitCache()
  }
 }
 const read=async()=>{const saved=gl.getParameter(gl.FRAMEBUFFER_BINDING),planes:Record<string,Uint8Array>={};try{for(const[key,buffer]of Object.entries({p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage,solvent:entry.solventLoad,foreign:entry.foreignSolventLoad,original:entry.original})){if(!buffer)throw Error('Missing seeded plane '+key);planes[key]=(buffer as AccumulationBuffer).readPixels()}planes.paper=withPaper(()=>captureNativePaperHeight(gl,ctx.paperTex(),size,[0,0],[ctx.paperWorldSize().w,ctx.paperWorldSize().h],ctx.paperScale()))}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,saved)}
  const paperContexts=withPaper(()=>({settle:engine._settlePlan.ctx.paperWorldSize(),passes:ctx.paperWorldSize(),ribbon:engine._ribbonPasses.ctx.paperWorldSize(),passesTexture:ctx.paperTex()===paper.texture,ribbonTexture:engine._ribbonPasses.ctx.paperTex()===paper.texture}));for(const world of[paperContexts.settle,paperContexts.passes,paperContexts.ribbon])if(world.w!==size||world.h!==size)throw Error('Paper context world mismatch');if(!paperContexts.passesTexture||!paperContexts.ribbonTexture)throw Error('Paper context texture mismatch')
  const planeSHA:Record<string,string>={};for(const[key,pixels]of Object.entries(planes)){planeSHA[key]=await hash(pixels);if(planeSHA[key]!==await hash(data.planes[key])){let changed=0,maxDelta=0,first=-1;for(let i=0;i<pixels.length;i++)if(pixels[i]!==data.planes[key][i]){changed++;maxDelta=Math.max(maxDelta,Math.abs(pixels[i]-data.planes[key][i]));if(first<0)first=i}throw Error('Native source independent readback mismatch '+key+' '+JSON.stringify({changed,maxDelta,first,actual:pixels[first],expected:data.planes[key][first]}))}}
  const roundtrip={rgba:new Uint8Array(n*4),water:new Uint8Array(n),paper:new Uint8Array(n)};for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x,j=((size-1-y)*size+x)*4;for(let k=0;k<4;k++)roundtrip.rgba[i*4+k]=Math.round(2*.5*planes.c[j+k]);roundtrip.water[i]=Math.min(255,planes.solvent[j+3]+planes.foreign[j+3]);roundtrip.paper[i]=planes.paper[j]}
  const commonSHA:Record<string,string>={};for(const[key,pixels]of Object.entries(roundtrip)){commonSHA[key]=await hash(pixels);if(commonSHA[key]!==await hash(data[key as 'rgba'|'water'|'paper']))throw Error('Native seed common roundtrip mismatch '+key)}
  if(gl.getError()!==gl.NO_ERROR)throw Error('Seed source readback GLerror')
  return{planeSHA,commonSHA,paperContexts,roundtripExact:true,sourceEncoding,nativeInterpretation:'numerical-carrier',nativeCompositeFair:false,pigmentScale:.5,seedEncodingScale:.5,sourceDisplayDensityScale,policy:'common-optical-seed-v1',qualification:'Explicit synthetic native material; independently read all source planes and actual sampled paper. Fixedscale .5 conversion separate from historical autoScale.',metadata:{seed,p:'A=B=commonA,R=G=round(A*water/255)',coverage:'A255 on wet-or-pigment,R128,G0,Bwater',foreign:'zero',original:'transparent',paperWorld:[size,size],paperScale:1,paperScope:'engine and all settle/passes/ribbon callbacks; restored finally'}}
 }
 try{
  if(gl.getError()!==gl.NO_ERROR)throw Error('Seed pre-existing GLerror')
  for(const[key,buffer]of Object.entries({p:entry.inkLoad,c:entry.inkColor,coverage:entry.coverage,original:entry.original})){if(!buffer)throw Error('Missing new scratch plane '+key);buffer.restorePixelsRect(size,size,data.planes[key])}
  entry.solventLoad=engine._ribbonScratchPool.acquire(size,size);entry.foreignSolventLoad=engine._ribbonScratchPool.acquire(size,size);entry.solventLoad!.restorePixelsRect(size,size,data.planes.solvent);entry.foreignSolventLoad!.restorePixelsRect(size,size,data.planes.foreign);paper.restorePixelsRect(size,size,data.planes.paper)
  // Native paper origin uses y-size and relies on a repeating world texture.
  const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);const bound=gl.getParameter(gl.TEXTURE_BINDING_2D);try{gl.bindTexture(gl.TEXTURE_2D,paper.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT)}finally{gl.bindTexture(gl.TEXTURE_2D,bound);gl.activeTexture(active)}
  const finish=anchor.scratch.finishContext;if(!finish||finish.profile.materialModel!=='front8-detail-flow-v4')throw Error('Seed requires explicit front8 finish context')
  source.gesture=1;source.noteFinish({...finish,bounds:{minX:0,minY:0,maxX:size,maxY:size},fieldSeed:[seed,0],radiusPx:40,dwellMs:0,landedWet:0,wetPeak:1});for(const paint of anchor.scratch.paints)source.paints.add(paint)
  source.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:1,migratePx:0,fieldSeed:[seed,0],bristleRadiusPx:0}));source.noteDirection(1,0)
  withPaper(()=>controller.diagnosticSetOwnedSource(source));installed=true
  const proof=await read()
  return{proof,withPaper,read,destroy(){if(destroyed)return;destroyed=true;paper.destroy()}}
 }catch(error){paper.destroy();if(!installed)source.destroy();throw error}
}
