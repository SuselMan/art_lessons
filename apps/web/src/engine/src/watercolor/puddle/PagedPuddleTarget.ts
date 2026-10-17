import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import type {ILayerBuffer,PaintTarget} from '../../buffers/ILayerBuffer'
import {createProgram} from '../../raster/utils'
import {MaterialFieldPages,type MaterialRect,type MaterialFieldSnapshot} from './MaterialFieldPages'
import {capturePagedPuddleSource,restorePagedPuddleWindow} from './PagedPuddleSource'
import {extractMaterialTileRect,materialTileIntersection} from './MaterialTileCoordinates'
import {createNativePuddleTarget,type PuddleTargetHost} from './PuddleTarget'
import {createPagedContrastPhase,type PagedBufferFactory} from './PagedContrastPhase'
import {createPagedBackgroundMix} from './PagedBackgroundMix'
import {m70WindowGroups} from './M70WindowGroups'
import {APPROVED_M70_PARAMETERS} from './PuddleParameters'

/** The new multi-tile route has one explicit 1536-minimum material domain.
 * Windows share global phases and immutable input; only their interiors commit.
 * The 640px halo is certified separately against the approved M70 pass graph. */
export interface PagedPuddleInspection {
 reference?(rect:MaterialRect,p:AccumulationBuffer,c:AccumulationBuffer):void
 windowReference?(rect:MaterialRect,p:AccumulationBuffer,c:AccumulationBuffer):void
 solved?(p:MaterialFieldSnapshot,c:MaterialFieldSnapshot,coverage:MaterialFieldSnapshot):void
 coarse?(value:ReturnType<ReturnType<typeof createPagedBackgroundMix>['readback']>):void
}
export function createPagedPuddleTarget(host:PuddleTargetHost,size:{width:number;height:number},make:PagedBufferFactory,inspect:PagedPuddleInspection={}){
 const gl=host.gl,read=()=>APPROVED_M70_PARAMETERS
 const contrast=createPagedContrastPhase(gl,read,size,make),background=createPagedBackgroundMix(gl,size,read,true,make)
 const vertex='attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}'
 const align=createProgram(gl,vertex,'precision highp float;varying vec2 uv;uniform sampler2D p,c;void main(){vec4 v=texture2D(p,uv);v.b=min(texture2D(c,uv).a,v.a);gl_FragColor=v;}')
 const guard=createProgram(gl,vertex,'precision highp float;varying vec2 uv;uniform sampler2D raw,result,water;void main(){float wet=smoothstep(0.,.03,texture2D(water,uv).a*4.);gl_FragColor=mix(texture2D(raw,uv),texture2D(result,uv),wet);}')
 const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 const state={done:true,epoch:0,iterations:0},outputs=new Map<AccumulationBuffer,{p:AccumulationBuffer;c:AccumulationBuffer;coverage:AccumulationBuffer}>()
 let running:Generator<void>|null=null,destroyed=false
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
  const raw=capturePagedPuddleSource(source,target,size,host.pool,host.passes)
  contrast.prepare({p:raw.inkLoad,c:raw.inkColor,water:raw.water},true);yield
  const referenceP=new MaterialFieldPages(size)
  // Eligibility is global too; build its reference from the same shared selector.
  for(const rect of rects()){
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
  for(const window of m70WindowGroups(size,domain,612)){
   // Certified geometry is world top-down; material snapshots are bottom-up.
   const {x:ox,y:oy}=window.field
   const rect={x:ox,y:size.height-oy-1536,width:1536,height:1536}
   const key=host.pool.acquire(1536,1536),windowSource=new RibbonStrokeScratch(host.pool,true,true)
   let native:ReturnType<typeof createNativePuddleTarget>|undefined
   try{
    restorePagedPuddleWindow(raw,rect,windowSource,key,host.pool)
    const context=source.finishContext;if(!context)throw Error('Missing paged finish context')
    const metadata=source.captureFinishMetadata()
    windowSource.gesture=source.gesture;for(const paint of source.paints)windowSource.paints.add(paint)
    windowSource.brushTravel=metadata.brushTravel.map(d=>({...d}));windowSource.wetContacts=metadata.wetContacts.map(d=>({...d}));windowSource.foreignSources=structuredClone(metadata.foreignSources)
    windowSource.noteFinish({...context,bounds:{minX:ox,minY:oy,maxX:ox+1536,maxY:oy+1536}})
    const sc=source.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:0,migratePx:0,fieldSeed:[0,0],bristleRadiusPx:0}))
    windowSource.compositeScalars(()=>({...sc,fieldSeed:[...sc.fieldSeed]}));const dir=source.noteDirection(0,0);windowSource.noteDirection(dir[0],dir[1])
    native=createNativePuddleTarget(host,1536,{portableNoise:true,bufferFactory:(w,h,f='linear')=>make(w,h,f),deferFinalMix:true,finalOnly:true,consumePreparedSource:true,
     contrast:{selection:contrast.selection,prepare:(p,c,w,_volume,rp,rc)=>{contrast.renderReference(rect,p,c,w,rp,rc);inspect.windowReference?.(rect,rp,rc)},destroy(){}},
     background:{capture(){},ops:()=>[],readback:()=>background.readback(),destroy(){}}})
    native.resetFromScratch(windowSource,{buffer:key,originX:ox,originY:oy,contentRect:null},epoch)
    while(!native.state.done){native.step(4);yield}
    const material=native.buffers()
    for(const [out,input]of [[solvedP,material.p],[solvedC,material.c],[solvedCoverage,material.coverage]] as const){
     const pixels=input.readPixels()
     for(const core of window.cores){
      const interior={...core,y:size.height-core.y-core.height}
      const local={x:interior.x-rect.x,y:interior.y-rect.y,width:interior.width,height:interior.height}
      out.writeRect(interior,extractMaterialTileRect(pixels,1536,1536,local))
     }
    }
   }finally{try{native?.destroy()}finally{try{windowSource.destroy()}finally{host.pool.release(key)}}}
   yield
  }
  inspect.solved?.(solvedP.snapshot(),solvedC.snapshot(),solvedCoverage.snapshot())
  background.prepareSolved({p:solvedP.snapshot(),c:solvedC.snapshot()});inspect.coarse?.(background.readback());yield
  const finalP=new MaterialFieldPages(size),finalC=new MaterialFieldPages(size),coverage=solvedCoverage.snapshot()
  for(const interior of rects()){
   const halo=background.reconstructionHalo,rect={x:interior.x-halo,y:interior.y-halo,width:interior.width+2*halo,height:interior.height+2*halo}
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
  destroyOutputs();for(const [key,value]of pending)outputs.set(key,value);pending.clear()
  }finally{for(const value of pending.values())for(const b of Object.values(value))b.destroy()}
 }
 return {state,resetFromScratch(source:RibbonStrokeScratch,target:ILayerBuffer,epoch:number){if(destroyed)throw Error('Paged target destroyed');running?.return(undefined);destroyOutputs();state.done=false;state.epoch=epoch;state.iterations=0;running=solve(source,target,epoch)},
  step(maxOps=1){try{for(let i=0;i<maxOps&&!state.done;i++){state.iterations++;if(running?.next().done){running=null;state.done=true}}return state}catch(error){running?.return(undefined);running=null;state.done=true;throw error}},
  buffers(tile:PaintTarget){const result=outputs.get(tile.buffer);if(!result)throw Error('Paged target has no completed tile');return result},dry(){return state.done&&outputs.size>0},
  cancel(){running?.return(undefined);running=null;state.done=true;destroyOutputs()},destroy(){if(destroyed)return;running?.return(undefined);running=null;destroyOutputs();contrast.destroy();background.destroy();gl.deleteProgram(align);gl.deleteProgram(guard);gl.deleteBuffer(quad);destroyed=true;state.done=true}}
}
