import{usesNativeFilterMask}from'../presets/nativeBrushFeatures'
import{hasFilterGaussian153Scope,hasFilterSmudge147Scope,hasFilterUnsharp159Scope}from'../presets/stationary195Scopes'
import { FILTER_COMPOSITE192_GLSL,filterComposite192Code,filterSourceOver192 } from './filterComposite192'
import{FilterGaussian153Pass}from'./FilterGaussian153'

const spatialFilter=(brush:BrushDescriptor|undefined,validated192=false):boolean=>validated192&&brush&&usesNativeFilterMask(brush)?brush.filter?.kind==='gaussian'||brush.filter?.kind==='unsharp'||brush.filter?.kind==='softBlur':hasFilterGaussian153Scope(brush)||hasFilterUnsharp159Scope(brush)
const unsharpFilter=(brush:BrushDescriptor|undefined,validated192=false):boolean=>validated192&&brush&&usesNativeFilterMask(brush)?brush.filter?.kind==='unsharp':hasFilterUnsharp159Scope(brush)
import{type BrushDescriptor,type BrushFilter}from'@grafetto/shared'
import type{PaintTarget}from'../buffers/ILayerBuffer'
import type{WorldRect}from'../buffers/tileMath'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{CanvasProjectionSampler}from'../raster/CanvasProjectionSampler'
import{createProgram,createFullscreenQuad}from'../raster/utils'
import{CanonicalBeginSource,type CanonicalSourceLease,type CanonicalSourceClaim}from'./CanonicalBeginSource'
import type{CanonicalBeginNotReady}from'./CanonicalBeginRuntime'
import{FILTER_POINTWISE_GLSL}from'./filterPointwise'
const key=(t:PaintTarget)=>JSON.stringify([t.originX,t.originY,t.buffer.width,t.buffer.height])
const VERT=`attribute vec2 a_position;uniform vec2 u_resolution;uniform vec4 u_rect;void main(){vec2 p=(u_rect.xy+(a_position*.5+.5)*u_rect.zw)/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const NEXT=`precision highp float;uniform sampler2D u_source;uniform sampler2D u_previous;uniform vec2 u_sourceResolution;uniform vec2 u_previousResolution;uniform vec4 u_filter;uniform float u_sourceOver;${FILTER_POINTWISE_GLSL}
void main(){vec2 pixel=vec2(gl_FragCoord.x,u_sourceResolution.y-gl_FragCoord.y);vec4 source=texture2D(u_source,gl_FragCoord.xy/u_sourceResolution);vec4 previous=texture2D(u_previous,vec2(pixel.x/u_previousResolution.x,1.-pixel.y/u_previousResolution.y));gl_FragColor=filterPointwise(source+previous*(1.-source.a)*u_sourceOver,u_filter);}`
const COPY=`precision highp float;uniform sampler2D u_current;uniform sampler2D u_next;uniform sampler2D u_mask;uniform vec2 u_resolution;uniform vec2 u_patchResolution;uniform float u_opacity;${FILTER_COMPOSITE192_GLSL}
void main(){vec2 pixel=gl_FragCoord.xy;vec2 local=vec2(pixel.x,u_resolution.y-pixel.y);vec2 patch=vec2(local.x/u_patchResolution.x,1.-local.y/u_patchResolution.y);vec4 current=texture2D(u_current,patch),next=texture2D(u_next,patch);float mask=texture2D(u_mask,pixel/u_resolution).a;gl_FragColor=filterSelection(current,next,clamp(mask*u_opacity,0.,1.));}`
export{CanonicalBeginBlocked as FilterSmudge147Blocked}from'./CanonicalBeginRuntime'
export interface FilterGaussian153Plan{readonly bounds:WorldRect;readonly needed:WorldRect;readonly update?:WorldRect;readonly side:number;readonly destinations:Array<{tile:PaintTarget;mask:AccumulationBuffer}>}
interface StoredTemporary{tile:PaintTarget;lease:CanonicalSourceLease}
export interface FilterSmudge147Request{readonly working:CanonicalSourceLease;readonly next:CanonicalSourceLease;readonly stages:readonly CanonicalSourceLease[];readonly spatial?:FilterGaussian153Plan;temporaryTiles():readonly PaintTarget[];temporary(tile:PaintTarget):AccumulationBuffer;assertCurrent():void;release():void}
/** Mutable T belongs only to this gesture scratch. Never retain/share it on a clone.
 * Restoring from a checkpoint must replay this capability from full BEGIN. */
export class FilterSmudge147State{
 private live=true
 private readonly temporary=new Map<string,StoredTemporary>()
 private readonly claims:(()=>void)[]=[]
 readonly source:CanonicalBeginSource
 private readonly acquire:(w:number,h:number)=>CanonicalSourceLease
 private readonly claim:CanonicalSourceClaim
 constructor(source:CanonicalBeginSource,acquire:(w:number,h:number)=>CanonicalSourceLease,claim:CanonicalSourceClaim){this.source=source;this.acquire=acquire;this.claim=claim}
 prepareRequest(tiles:readonly PaintTarget[],spatial?:FilterGaussian153Plan):{kind:'ready';request:FilterSmudge147Request}|CanonicalBeginNotReady{
  this.assertCurrent();const distinct=new Map<string,PaintTarget>();let maxW=0,maxH=0,bytes=0
  for(const tile of tiles){const{width,height}=tile.buffer;if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||![tile.originX,tile.originY].every(Number.isFinite))throw Error('Invalid Filter147 tile');const k=key(tile);if(distinct.has(k))throw Error('Duplicate Filter147 tile');distinct.set(k,tile);maxW=Math.max(maxW,width);maxH=Math.max(maxH,height);if(!this.temporary.has(k))bytes+=width*height*4}
  if(!tiles.length)throw Error('Filter147 empty request has no resources')
  // Existing projection sampler has one square world/pixel extent.
  maxW=maxH=spatial?.side??Math.max(maxW,maxH)
  if(spatial&&(!Number.isSafeInteger(maxW)||maxW<1))throw Error('Invalid Gaussian153 patch')
  const transientBytes=(spatial?4:2)*maxW*maxH*4;if(!Number.isSafeInteger(bytes+transientBytes))throw Error('Filter147 byte overflow')
  const persistent=bytes?this.claim(bytes):()=>{};if(typeof persistent!=='function')return persistent
  let transientClaim:ReturnType<CanonicalSourceClaim>
  try{transientClaim=this.claim(transientBytes)}catch(error){try{persistent()}catch{/* Preserve the resource admission failure. */}throw error}
  if(typeof transientClaim!=='function'){persistent();return transientClaim}
  const fresh:StoredTemporary[]=[],transient:CanonicalSourceLease[]=[];let published=false,failed=false
  try{
   for(const[k,tile]of distinct){if(this.temporary.has(k))continue;const lease=this.acquire(tile.buffer.width,tile.buffer.height);fresh.push({tile,lease});lease.assertCurrent();if(lease.buffer===tile.buffer||lease.buffer.texture===tile.buffer.texture||lease.buffer.width!==tile.buffer.width||lease.buffer.height!==tile.buffer.height)throw Error('Filter147 temporary aliases destination');lease.buffer.clear()}
   for(let n=0;n<(spatial?4:2);n++){const lease=this.acquire(maxW,maxH);transient.push(lease);lease.assertCurrent();if(lease.buffer.width!==maxW||lease.buffer.height!==maxH)throw Error('Filter147 staging dimensions mismatch')}
   const all=[...this.temporary.values()].map(x=>x.lease).concat(fresh.map(x=>x.lease),transient);if(new Set(all.map(x=>x.buffer.texture)).size!==all.length)throw Error('Filter147 staging aliases')
   this.assertCurrent();for(const entry of fresh)this.temporary.set(key(entry.tile),entry)
   if(bytes)this.claims.push(persistent);published=true;let released=false
   const request:FilterSmudge147Request={working:transient[0],next:transient[1],stages:transient,spatial,temporaryTiles:()=>[...this.temporary.values()].map(entry=>({...entry.tile,buffer:entry.lease.buffer})),temporary:tile=>{const entry=this.temporary.get(key(tile));if(!entry)throw Error('Unplanned Filter147 tile');entry.lease.assertCurrent();return entry.lease.buffer},assertCurrent:()=>{if(released)throw Error('Filter147 request released');this.assertCurrent();for(const lease of transient)lease.assertCurrent()},release:()=>{if(released)return;released=true;let error:unknown,failed=false;for(const release of[...transient.map(lease=>()=>lease.release()),transientClaim])try{release()}catch(e){if(!failed){failed=true;error=e}}if(failed)throw error}}
   return{kind:'ready',request}
  }catch(error){failed=true;throw error}finally{if(!published){let first:unknown,cleanupFailed=false;for(const lease of[...fresh.map(x=>x.lease),...transient])try{lease.release()}catch(e){if(!cleanupFailed){cleanupFailed=true;first=e}}for(const release of[persistent,transientClaim])try{release()}catch(e){if(!cleanupFailed){cleanupFailed=true;first=e}}if(!failed&&cleanupFailed)throw first}}
 }
 assertCurrent():void{if(!this.live)throw Error('Filter147 gesture retired');this.source.assertCurrent();for(const entry of this.temporary.values())entry.lease.assertCurrent()}
 release():void{if(!this.live)return;this.live=false;let failed=false,primary:unknown;const attempt=(f:()=>void)=>{try{f()}catch(e){if(!failed){failed=true;primary=e}}};for(const entry of this.temporary.values())attempt(()=>entry.lease.release());this.temporary.clear();for(const release of this.claims)attempt(release);this.claims.length=0;attempt(()=>this.source.release());if(failed)throw primary}
}
/** One pointwise request; S immutable, T unmasked persistent, D current.
 * Geometry/recovery/mask acceptance belongs to the existing BBP owner. */
export class FilterSmudge147Pass{
 private gaussian?:FilterGaussian153Pass
 private next?:WebGLProgram;private copy?:WebGLProgram;private geometry?:WebGLBuffer
 private readonly sampler:CanvasProjectionSampler
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl;this.sampler=new CanvasProjectionSampler(gl,()=>this.geometry!)}
 prepare(brush?:BrushDescriptor,validated192=false):void{this.geometry??=createFullscreenQuad(this.gl);this.next??=createProgram(this.gl,VERT,NEXT);this.copy??=createProgram(this.gl,VERT,COPY);this.sampler.prepare();(this.gaussian??=new FilterGaussian153Pass(this.gl)).prepare();if(unsharpFilter(brush,validated192))this.gaussian!.prepareUnsharp159()}
 assertPrepared(brush?:BrushDescriptor,validated192=false):void{if(!this.geometry||!this.next||!this.copy)throw Error('Filter147 programs are not prepared');if(unsharpFilter(brush,validated192)){if(!this.gaussian)throw Error('Spatial programs missing');this.gaussian.assertUnsharp159Prepared()}}
 forget():void{this.geometry=undefined;this.next=undefined;this.copy=undefined;this.sampler.forget();this.gaussian?.forget()}
 destroy():void{if(this.geometry)this.gl.deleteBuffer(this.geometry);if(this.next)this.gl.deleteProgram(this.next);if(this.copy)this.gl.deleteProgram(this.copy);this.sampler.destroy();this.gaussian?.destroy();this.forget()}
 private draw(program:WebGLProgram,target:AccumulationBuffer,rect:WorldRect):void{const gl=this.gl;gl.useProgram(program);gl.uniform2f(gl.getUniformLocation(program,'u_resolution'),target.width,target.height);gl.uniform4f(gl.getUniformLocation(program,'u_rect'),rect.minX,rect.minY,rect.maxX-rect.minX,rect.maxY-rect.minY);gl.bindBuffer(gl.ARRAY_BUFFER,this.geometry!);const at=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);try{gl.drawArrays(gl.TRIANGLES,0,6)}finally{gl.disableVertexAttribArray(at)}}
 paint(brush:BrushDescriptor,state:FilterSmudge147State,request:FilterSmudge147Request,tile:PaintTarget,bounds:WorldRect,mask:AccumulationBuffer,opacity:number,validated192=false):void{
  if(!(validated192&&usesNativeFilterMask(brush))&&!hasFilterSmudge147Scope(brush))throw Error('Invalid Filter147 scope');this.assertPrepared(brush,validated192);request.assertCurrent();if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('Invalid Filter147 opacity')
  if(spatialFilter(brush,validated192)){if(!request.spatial)throw Error('Gaussian153 request plan missing');request.spatial.destinations.push({tile,mask});return}
  const filter=brush.filter as Exclude<BrushFilter,{version:1}>,gl=this.gl,working=request.working.buffer,next=request.next.buffer,previous=request.temporary(tile)
  if(new Set([working.texture,next.texture,previous.texture,tile.buffer.texture,mask.texture]).size!==5)throw Error('Filter147 sampled target alias')
  const left=Math.max(0,Math.floor(bounds.minX-tile.originX)),top=Math.max(0,Math.floor(bounds.minY-tile.originY)),right=Math.min(tile.buffer.width,Math.ceil(bounds.maxX-tile.originX)),bottom=Math.min(tile.buffer.height,Math.ceil(bounds.maxY-tile.originY));if(right<=left||bottom<=top)return
  const world={minX:tile.originX,minY:tile.originY,maxX:tile.originX+working.width,maxY:tile.originY+working.height}
  this.sampler.gather(working,world,[{opacity:1,buffer:{resolveVisible:r=>[...state.source.resolveForRead(r)]}}])
  next.beginReplaceDraw();try{gl.useProgram(this.next!);for(const[unit,texture,name]of[[0,working.texture,'u_source'],[1,previous.texture,'u_previous']]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(this.next!,name),unit)}gl.uniform1f(gl.getUniformLocation(this.next!,'u_sourceOver'),filterSourceOver192(brush));gl.uniform2f(gl.getUniformLocation(this.next!,'u_sourceResolution'),working.width,working.height);gl.uniform2f(gl.getUniformLocation(this.next!,'u_previousResolution'),previous.width,previous.height);if(filter.kind==='noise'){
   gl.uniform4f(gl.getUniformLocation(this.next!,'u_noiseSeeds'),...filter.seeds.map(v=>v%4093) as [number,number,number,number])
   gl.uniform4f(gl.getUniformLocation(this.next!,'u_noiseSettings'),filter.level/100,Math.floor(255*filter.opacity/100)/255,filter.grayscale?1:0,0)
   gl.uniform2f(gl.getUniformLocation(this.next!,'u_noiseWorldOrigin'),tile.originX,tile.originY)
   gl.uniform2f(gl.getUniformLocation(this.next!,'u_noiseResolution'),working.width,working.height)
  }
  if(filter.kind==='colorBalance'){
   gl.uniform3f(gl.getUniformLocation(this.next!,'u_balanceShadows'),...filter.shadows)
   gl.uniform3f(gl.getUniformLocation(this.next!,'u_balanceMidtones'),...filter.midtones)
   gl.uniform3f(gl.getUniformLocation(this.next!,'u_balanceHighlights'),...filter.highlights)
  }
  gl.uniform4f(gl.getUniformLocation(this.next!,'u_filter'),filter.kind==='posterize'?filter.steps:filter.kind==='desaturate'?filter.type:filter.kind==='hsvSaturation'?filter.amount:filter.kind==='colorBalance'&&filter.preserveLuminosity?1:0,0,0,filter.kind==='noise'?7:filter.kind==='hsvSaturation'?6:filter.kind==='colorBalance'?5:filter.kind==='posterize'?4:filter.kind==='desaturate'?3:2);this.draw(this.next!,next,{minX:left,minY:top,maxX:right,maxY:bottom})}finally{next.endDraw()}
  request.assertCurrent();tile.buffer.copyRegionInto(working,0,0,0,working.height-tile.buffer.height,tile.buffer.width,tile.buffer.height)
  next.copyRegionInto(previous,left,next.height-bottom,left,previous.height-bottom,right-left,bottom-top)
  tile.buffer.beginReplaceDraw();try{gl.useProgram(this.copy!);for(const[unit,texture,name]of[[0,working.texture,'u_current'],[1,next.texture,'u_next'],[2,mask.texture,'u_mask']]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(this.copy!,name),unit)}gl.uniform2f(gl.getUniformLocation(this.copy!,'u_patchResolution'),working.width,working.height);gl.uniform1f(gl.getUniformLocation(this.copy!,'u_filterComposite'),filterComposite192Code(brush));gl.uniform1f(gl.getUniformLocation(this.copy!,'u_opacity'),opacity);this.draw(this.copy!,tile.buffer,{minX:left,minY:top,maxX:right,maxY:bottom})}finally{tile.buffer.endDraw()}
 }
 finishSpatial(brush:BrushDescriptor,state:FilterSmudge147State,request:FilterSmudge147Request,validated192=false):void{if(spatialFilter(brush,validated192)){if(!this.gaussian)throw Error('Gaussian153 programs not prepared');this.gaussian.paint(brush,state,request,validated192)}}

}
