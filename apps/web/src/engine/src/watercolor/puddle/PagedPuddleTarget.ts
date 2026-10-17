import {CapturedReadScope} from './CapturedReadScope'
import {emptyM70PostphaseRect} from './M70EmptyPostphase'
import {committedReadRect} from './CommittedReadRect'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import type {ILayerBuffer,PaintTarget} from '../../buffers/ILayerBuffer'
import {createProgram} from '../../raster/utils'
import {MaterialFieldPages,type MaterialRect,type MaterialFieldSnapshot} from './MaterialFieldPages'
import {capturePagedPuddleSource,capturePagedPuddleSourceSteps,type PagedCaptureStep,restorePagedPuddleWindow,createDetachedPagedPuddleWindow,type PagedPuddleSource} from './PagedPuddleSource'
import {extractMaterialTileRect,materialTileIntersection} from './MaterialTileCoordinates'
import {createNativePuddleTarget,type PuddleTargetHost} from './PuddleTarget'
import {createPagedContrastPhase,type PagedBufferFactory} from './PagedContrastPhase'
import {createPagedBackgroundMix} from './PagedBackgroundMix'
import {type M70CapturedSupport,keepM70FixedGroup} from './M70FixedWindowSkip'
import {m70WindowGroups} from './M70WindowGroups'
import {APPROVED_M70_PARAMETERS} from './PuddleParameters'

/** The new multi-tile route has one explicit 1536-minimum material domain.
 * Windows share global phases and immutable input; only their interiors commit.
 * The 640px halo is certified separately against the approved M70 pass graph. */
/** QA observer lifetime: hooks may exist only inside synchronous run(), never across yields. */
export interface PagedNativeScope {run<T>(work:()=>T):T;dispose():void}
export type PagedNativeScopeFactory=(host:PuddleTargetHost,rect:Readonly<MaterialRect>,proof:Readonly<{epoch:number;boundary:'zero';noForeignStencil:boolean;support:M70CapturedSupport|undefined}>)=>PagedNativeScope|undefined
export interface PagedPuddleInspection {
 /** Default undefined: no observer, no added draws/state changes. */
 nativeScope?:PagedNativeScopeFactory
 /** QA-only OFF: omit global reference rectangles certified raw-zero. */
 skipEmptyReference?:boolean
 referenceEmpty?(rect:MaterialRect):void
 /** QA-only default OFF: capture read ownership and reuse sole-water bytes. */
 persistCapturedBacking?:boolean
 capturedBacking?:boolean
 /** Separate scheduling experiment, default OFF. */
 cooperativeCapture?:boolean
 captureStep?(step:PagedCaptureStep):void
 /** Separate deadline experiment, default OFF; checked after each next(). */
 stepBudgetMs?:number
 /** QA-only OFF: zero raw allocated-halo postphase rectangles need no GPU work. */
 skipEmptyPostphase?:boolean
 postphaseRect?(interior:MaterialRect,allocated:MaterialRect,decision:{skipped:boolean}):void
 /** QA certificate experiment only, default OFF. Fixed field geometry unchanged. */
 tightMaterialSupport32?:boolean
 windowSupport?(field:MaterialRect,cores:readonly MaterialRect[],decision:{radius:32|612;noForeignStencil:boolean;kept:boolean}):void
 /** Optional diagnostic barrier after immutable capture, before field allocation. */
 sourceCaptured?(raw:PagedPuddleSource):{release():void}|{defer:true}|void
 /** QA-only; default preserves the six-plane baseline. */
 omitZeroForeignSolventLoad?:boolean
 /** QA-only; scratch owns the key as its original plane. */
 detachedWindowSource?:boolean
 /** QA candidate only, default OFF: preserve all existing field/core geometry. */
 skipEmptyFixedWindows?:boolean
 windowSkipped?(field:MaterialRect,cores:readonly MaterialRect[]):void
 reference?(rect:MaterialRect,p:AccumulationBuffer,c:AccumulationBuffer):void
 windowReference?(rect:MaterialRect,p:AccumulationBuffer,c:AccumulationBuffer):void
 solved?(p:MaterialFieldSnapshot,c:MaterialFieldSnapshot,coverage:MaterialFieldSnapshot):void
 coarse?(value:ReturnType<ReturnType<typeof createPagedBackgroundMix>['readback']>):void
}
export function createPagedPuddleTarget(host:PuddleTargetHost,size:{width:number;height:number},make:PagedBufferFactory,inspect:PagedPuddleInspection={}){
 if(inspect.persistCapturedBacking===true&&inspect.capturedBacking!==true)throw new Error('Persistent capture requires captured backing')
 const gl=host.gl,read=()=>APPROVED_M70_PARAMETERS
 const contrast=createPagedContrastPhase(gl,read,size,make),background=createPagedBackgroundMix(gl,size,read,true,make)
 const vertex='attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}'
 const align=createProgram(gl,vertex,'precision highp float;varying vec2 uv;uniform sampler2D p,c;void main(){vec4 v=texture2D(p,uv);v.b=min(texture2D(c,uv).a,v.a);gl_FragColor=v;}')
 const guard=createProgram(gl,vertex,'precision highp float;varying vec2 uv;uniform sampler2D raw,result,water;void main(){float wet=smoothstep(0.,.03,texture2D(water,uv).a*4.);gl_FragColor=mix(texture2D(raw,uv),texture2D(result,uv),wet);}')
 const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 const state={done:true,epoch:0,iterations:0,admissionBlocked:false,get executing(){return stepDepth>0}},outputs=new Map<AccumulationBuffer,{p:AccumulationBuffer;c:AccumulationBuffer;coverage:AccumulationBuffer}>()
 let running:Generator<void>|null=null,destroyed=false,captureBlocked=false,stepDepth=0,pendingCancel=false,pendingDestroy=false
 function draw(program:WebGLProgram,out:AccumulationBuffer,textures:Record<string,AccumulationBuffer>){
  out.beginReplaceDraw()
  try{
   gl.disable(gl.SCISSOR_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad)
   const pos=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0)
   for(const [i,[name,buffer]] of Object.entries(textures).entries()){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,buffer.texture);gl.uniform1i(gl.getUniformLocation(program,name),i)}
   gl.drawArrays(gl.TRIANGLES,0,6)
  }finally{try{out.endDraw()}finally{gl.activeTexture(gl.TEXTURE0)}}
 }
 function allocateMany(count:number,width:number,height:number):AccumulationBuffer[]{
  const allocated:AccumulationBuffer[]=[]
  try{for(let i=0;i<count;i++)allocated.push(make(width,height,'nearest'));return allocated}
  catch(error){for(const buffer of allocated)buffer.destroy();throw error}
 }
 function* rects(step=512):Generator<MaterialRect>{for(let y=0;y<size.height;y+=step)for(let x=0;x<size.width;x+=step)yield{x,y,width:Math.min(step,size.width-x),height:Math.min(step,size.height-y)}}
 function destroyOutputs(){for(const value of outputs.values())for(const b of Object.values(value))b.destroy();outputs.clear()}
 function* solve(source:RibbonStrokeScratch,target:ILayerBuffer,epoch:number):Generator<void>{
  const captureReads=inspect.capturedBacking===true?new CapturedReadScope({persistUntilRelease:inspect.persistCapturedBacking===true,maxRetainedBytes:64*1024*1024}):undefined
  try{
  let raw:ReturnType<typeof capturePagedPuddleSource>
  if(inspect.cooperativeCapture===true){
   const capture=capturePagedPuddleSourceSteps(source,target,size,host.pool,host.passes,{captureReads,reuseSingleWaterRead:inspect.capturedBacking===true,validateRevision:true,rowBatchHeight:256})
   try{while(true){const step=capture.next();if(step.done){if(!step.value)return;raw=step.value;break}inspect.captureStep?.(step.value);if(pendingCancel)return;yield}}
   finally{capture.return(undefined)}
  }else raw=capturePagedPuddleSource(source,target,size,host.pool,host.passes,{captureReads,reuseSingleWaterRead:inspect.capturedBacking===true})
  let capturedLease:{release():void}|void
  while(true){
   const admission=inspect.sourceCaptured?.(raw)
   if(admission&&'defer' in admission){captureBlocked=true;state.admissionBlocked=true;try{yield}finally{captureBlocked=false;state.admissionBlocked=false}continue}
   capturedLease=admission;break
  }
  try{
  if(pendingCancel)return
  contrast.prepare({p:raw.inkLoad,c:raw.inkColor,water:raw.water},true);yield
  const referenceP=new MaterialFieldPages(size)
  // Eligibility is global too; build its reference from the same shared selector.
  for(const rect of rects()){
   if(inspect.skipEmptyReference===true&&emptyM70PostphaseRect(size,rect,raw.materialSupport)){
    inspect.referenceEmpty?.(rect)
    if(pendingCancel)return
    yield;continue
   }
   const bufs=allocateMany(6,rect.width,rect.height)
   try{const [p,c,w,aligned,rp,rc]=bufs as [AccumulationBuffer,AccumulationBuffer,AccumulationBuffer,AccumulationBuffer,AccumulationBuffer,AccumulationBuffer]
    p.writePixels(raw.inkLoad.readRect(rect));c.writePixels(raw.inkColor.readRect(rect));w.writePixels(raw.water.readRect(rect));draw(align,aligned,{p,c})
    contrast.renderReference(rect,aligned,c,w,rp,rc);inspect.reference?.(rect,rp,rc);referenceP.writeRect(rect,rp.readPixels())
   }finally{for(const b of bufs)b.destroy()}
   yield
  }
  background.capture({initialP:raw.inkLoad,referenceP:referenceP.snapshot(),coverage:raw.coverage});yield
  const solvedP=new MaterialFieldPages(size),solvedC=new MaterialFieldPages(size),solvedCoverage=new MaterialFieldPages(size)
  const domain={width:Math.max(1536,Math.ceil(size.width/256)*256),height:Math.max(1536,Math.ceil(size.height/256)*256)}
  const noForeign=(value:unknown)=>value===null||(Array.isArray(value)&&value.length===0)
  const metadataKnown=()=>typeof source.captureFinishMetadata==='function'&&noForeign(source.captureFinishMetadata().foreignSources)
  // Metadata proof belongs to this immutable captured revision. Unknown falls
  // back to612; appearance of a donor AFTER tight skips is an invalidation.
  const radius:32|612=inspect.tightMaterialSupport32===true&&raw.materialSupport?.noForeignStencil===true&&metadataKnown()?32:612
  for(const window of m70WindowGroups(size,domain,612)){
   if(radius===32&&!metadataKnown())throw Error('M70 support metadata changed during immutable solve')
   const kept=inspect.skipEmptyFixedWindows!==true||keepM70FixedGroup(size,window,raw.materialSupport,radius)
   inspect.windowSupport?.(window.field,window.cores,{radius,noForeignStencil:raw.materialSupport?.noForeignStencil===true,kept})
   if(radius===32&&!metadataKnown())throw Error('M70 support metadata changed during window inspection')
   if(pendingCancel)return
   if(!kept){
    // Native output coverage is the captured contour, not the front's temporary coverage.
    // Keep P/C pages zero; preserve exact raw coverage for every skipped core.
    for(const core of window.cores){const interior={...core,y:size.height-core.y-core.height};solvedCoverage.writeRect(interior,raw.coverage.readRect(interior))}
    inspect.windowSkipped?.(window.field,window.cores)
    yield;continue
   }
   // Certified geometry is world top-down; material snapshots are bottom-up.
   const {x:ox,y:oy}=window.field
   const rect={x:ox,y:size.height-oy-1536,width:1536,height:1536}
   const windowSource=new RibbonStrokeScratch(host.pool,true,true)
   let key:AccumulationBuffer|undefined
   const detachedWindowSource=inspect.detachedWindowSource===true
   const windowReads=inspect.persistCapturedBacking===true?new CapturedReadScope({persistUntilRelease:true,maxRetainedBytes:6*1536*1536*4}):undefined
   let nativeScope:PagedNativeScope|undefined
   let native:ReturnType<typeof createNativePuddleTarget>|undefined
   try{
    const restoreOptions={captureReads:windowReads,omitZeroForeignSolventLoad:inspect.omitZeroForeignSolventLoad}
    if(detachedWindowSource)key=createDetachedPagedPuddleWindow(raw,rect,windowSource,restoreOptions)
    else{key=host.pool.acquire(1536,1536);restorePagedPuddleWindow(raw,rect,windowSource,key,host.pool,restoreOptions)}
    const context=source.finishContext;if(!context)throw Error('Missing paged finish context')
    const metadata=source.captureFinishMetadata()
    if(radius===32&&!noForeign(metadata.foreignSources))throw Error('M70 support metadata changed during window restore')
    windowSource.gesture=source.gesture;for(const paint of source.paints)windowSource.paints.add(paint)
    windowSource.brushTravel=metadata.brushTravel.map(d=>({...d}));windowSource.wetContacts=metadata.wetContacts.map(d=>({...d}));windowSource.foreignSources=structuredClone(metadata.foreignSources)
    windowSource.noteFinish({...context,bounds:{minX:ox,minY:oy,maxX:ox+1536,maxY:oy+1536}})
    const sc=source.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:0,migratePx:0,fieldSeed:[0,0],bristleRadiusPx:0}))
    windowSource.compositeScalars(()=>({...sc,fieldSeed:[...sc.fieldSeed]}));const dir=source.noteDirection(0,0);windowSource.noteDirection(dir[0],dir[1])
    native=createNativePuddleTarget(host,1536,{portableNoise:true,bufferFactory:(w,h,f='linear')=>make(w,h,f),deferFinalMix:true,finalOnly:true,consumePreparedSource:true,
     contrast:{selection:contrast.selection,prepare:(p,c,w,_volume,rp,rc)=>{contrast.renderReference(rect,p,c,w,rp,rc);inspect.windowReference?.(rect,rp,rc)},destroy(){}},
     background:{capture(){},ops:()=>[],readback:()=>background.readback(),destroy(){}}})
    if(inspect.nativeScope){
     // Captured support belongs to this immutable raw epoch. Expose detached metadata only.
     const support=raw.materialSupport?structuredClone(raw.materialSupport):undefined
     const proof=Object.freeze({epoch,boundary:'zero' as const,noForeignStencil:support?.noForeignStencil===true&&noForeign(metadata.foreignSources),support})
     nativeScope=inspect.nativeScope(host,Object.freeze({...rect}),proof)
    }
    const reset=()=>native!.resetFromScratch(windowSource,{buffer:key!,originX:ox,originY:oy,contentRect:null},epoch)
    if(nativeScope)nativeScope.run(reset);else reset()
    while(!native.state.done){if(nativeScope)nativeScope.run(()=>native!.step(4));else native.step(4);yield}
    const material=native.buffers(),readRect=committedReadRect(window.field,window.cores)
    const planes=[[solvedP,material.p],[solvedC,material.c],[solvedCoverage,material.coverage]] as const
    for(const [plane,[out,input]]of planes.entries()){
     const pixels=input.readPixelsRegion(readRect.x,readRect.y,readRect.width,readRect.height)
     for(const core of window.cores){
      const interior={...core,y:size.height-core.y-core.height}
      const local={x:interior.x-rect.x,y:interior.y-rect.y,width:interior.width,height:interior.height}
      out.writeRect(interior,extractMaterialTileRect(pixels,readRect.width,readRect.height,{...local,x:local.x-readRect.x,y:local.y-readRect.y}))
     }
     // Let the outer deadline run between required GPU reads; publish only complete goals.
     if(plane+1<planes.length)yield
    }
   }finally{try{nativeScope?.dispose()}finally{try{native?.destroy()}finally{try{windowReads?.dispose()}finally{try{windowSource.destroy()}finally{if(key&&!detachedWindowSource)host.pool.release(key)}}}}}
   yield
  }
  if(radius===32&&!metadataKnown())throw Error('M70 support metadata changed after window solve')
  inspect.solved?.(solvedP.snapshot(),solvedC.snapshot(),solvedCoverage.snapshot())
  background.prepareSolved({p:solvedP.snapshot(),c:solvedC.snapshot()});inspect.coarse?.(background.readback());yield
  const finalP=new MaterialFieldPages(size),finalC=new MaterialFieldPages(size),coverage=solvedCoverage.snapshot()
  for(const interior of rects()){
   const halo=background.reconstructionHalo,rect={x:interior.x-halo,y:interior.y-halo,width:interior.width+2*halo,height:interior.height+2*halo}
   const skipped=inspect.skipEmptyPostphase===true&&emptyM70PostphaseRect(size,rect,raw.materialSupport)
   inspect.postphaseRect?.(interior,rect,{skipped})
   if(pendingCancel)return
   if(skipped){yield;continue}
   const bufs=allocateMany(8,rect.width,rect.height)
   try{const [p,c,cov,rp,rc,rawBuffer,w,out]=bufs as [AccumulationBuffer,AccumulationBuffer,AccumulationBuffer,AccumulationBuffer,AccumulationBuffer,AccumulationBuffer,AccumulationBuffer,AccumulationBuffer]
    p.writePixels(solvedP.snapshot().readRect(rect));c.writePixels(solvedC.snapshot().readRect(rect));cov.writePixels(coverage.readRect(rect));w.writePixels(raw.water.readRect(rect))
    background.reconstruct(rect,p,c,cov,rp,rc)
    for(const [result,input,field]of [[rp,raw.inkLoad,finalP],[rc,raw.inkColor,finalC]] as const){
     rawBuffer.writePixels(input.readRect(rect));draw(guard,out,{raw:rawBuffer,result,water:w})
     field.writeRect(interior,extractMaterialTileRect(out.readPixels(),rect.width,rect.height,{x:halo,y:halo,width:interior.width,height:interior.height}))
    }
   }finally{for(const b of bufs)b.destroy()}
   yield
  }
  // Publish only after every window and global postphase completed successfully.
  const pending=new Map<AccumulationBuffer,{p:AccumulationBuffer;c:AccumulationBuffer;coverage:AccumulationBuffer}>()
  try{for(const tile of target.allResident()){
   const entry=source.peek(tile.buffer);if(!entry?.inkLoad||!entry.inkColor)continue
   const clip=materialTileIntersection(size,{...tile,width:tile.buffer.width,height:tile.buffer.height})
   const [p,c,coverageBuffer]=allocateMany(3,tile.buffer.width,tile.buffer.height) as [AccumulationBuffer,AccumulationBuffer,AccumulationBuffer]
   const material={p,c,coverage:coverageBuffer}
   pending.set(tile.buffer,material)
   const planes:readonly (readonly [AccumulationBuffer,AccumulationBuffer,MaterialFieldSnapshot])[]=[
    [material.p,entry.inkLoad,finalP.snapshot()],[material.c,entry.inkColor,finalC.snapshot()],[material.coverage,entry.coverage,coverage]]
   for(const [buffer,original,field]of planes){
    const bytes=original.readPixels()
    if(clip){const pixels=field.readRect(clip.field);for(let y=0;y<clip.texture.height;y++)bytes.set(pixels.subarray(y*clip.texture.width*4,(y+1)*clip.texture.width*4),((clip.texture.y+y)*buffer.width+clip.texture.x)*4)}
    // The target is dry; the source's water is retained independently.
    if(buffer===material.coverage)for(let i=2;i<bytes.length;i+=4)bytes[i]=0
    buffer.writePixels(bytes)
   }
  }
  if(radius===32&&!metadataKnown())throw Error('M70 support metadata changed before publication')
  if(pendingCancel)return
  destroyOutputs();for(const [key,value]of pending)outputs.set(key,value);pending.clear()
  }finally{for(const value of pending.values())for(const b of Object.values(value))b.destroy()}
 }finally{capturedLease?.release()}
  }finally{captureReads?.dispose()}
 }
 function finishDestroy():void {
  if(destroyed)return
  destroyOutputs();contrast.destroy();background.destroy();gl.deleteProgram(align);gl.deleteProgram(guard);gl.deleteBuffer(quad);destroyed=true;state.done=true
 }
 function flushCancel():void {
  if(stepDepth||!pendingCancel)return
  pendingCancel=false;const old=running;running=null
  try{old?.return(undefined)}finally{
   state.done=true;state.admissionBlocked=false;captureBlocked=false;destroyOutputs()
   if(pendingDestroy){pendingDestroy=false;finishDestroy()}
  }
 }
 return {state,resetFromScratch(source:RibbonStrokeScratch,target:ILayerBuffer,epoch:number){
  if(destroyed||pendingDestroy)throw Error('Paged target destroyed')
  if(stepDepth)throw Error('Cannot reset an executing paged target')
  pendingCancel=true;flushCancel();destroyOutputs();state.done=false;state.admissionBlocked=false;state.epoch=epoch;state.iterations=0;running=solve(source,target,epoch)
 },
 step(maxOps=1){
  if(destroyed||state.done)return state
  const budget=inspect.stepBudgetMs
  const deadline=typeof budget==='number'&&Number.isFinite(budget)&&budget>0?performance.now()+budget:Infinity
  stepDepth++
  try{for(let i=0;i<maxOps&&!state.done&&!pendingCancel;i++){
   state.iterations++;if(running?.next().done){running=null;state.done=true}
   if(captureBlocked||pendingCancel||(deadline!==Infinity&&performance.now()>=deadline))break
  }return state}catch(error){pendingCancel=true;throw error}finally{stepDepth--;flushCancel()}
 },
 buffers(tile:PaintTarget){const result=outputs.get(tile.buffer);if(!result)throw Error('Paged target has no completed tile');return result},dry(){return state.done&&outputs.size>0},
 cancel(){pendingCancel=true;flushCancel()},
 destroy(){if(destroyed)return;pendingDestroy=true;pendingCancel=true;flushCancel()}}
}
