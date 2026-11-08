import type{CanonicalBeginCapability}from'./CanonicalBeginRuntime'
import {CanonicalBeginSource,type CanonicalBeginLayeredView,type CanonicalSourceLease,type CanonicalSourceClaim}from'./CanonicalBeginSource'
import type{CanonicalBeginBinding}from'./CanonicalBeginRuntime'
import type{BrushSourceContext,Dab}from'@grafetto/shared'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer,PaintTarget}from'../buffers/ILayerBuffer'
import type{WorldRect}from'../buffers/tileMath'
import type{BrushScratch}from'./BrushPainter'
import{CanvasProjectionSampler}from'../raster/CanvasProjectionSampler'
import{createProgram,createFullscreenQuad}from'../raster/utils'
const VERT=`attribute vec2 a_position;uniform vec2 u_resolution;uniform vec4 u_rect;void main(){vec2 p=(u_rect.xy+(a_position*.5+.5)*u_rect.zw)/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision highp float;uniform sampler2D u_source;uniform sampler2D u_mask;uniform vec2 u_resolution;uniform vec3 u_patch;uniform float u_opacity;void main(){vec2 local=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);vec2 uv=(local-u_patch.xy)/u_patch.z;vec4 src=texture2D(u_source,vec2(uv.x,1.-uv.y));gl_FragColor=src*texture2D(u_mask,gl_FragCoord.xy/u_resolution).a*u_opacity;}`
/** One bounded source patch; pre-stroke originals share the normal ribbon
 * scratch. Destination uses OVER per dab, including transparent source pixels. */
export class CloneBrushPass{
 private program?:WebGLProgram
 private prepared=false
 private geometry?:WebGLBuffer
 private patch?:AccumulationBuffer
 private readonly sampler:CanvasProjectionSampler
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl;this.sampler=new CanvasProjectionSampler(gl,()=>this.quad())}
 private quad():WebGLBuffer{return this.geometry??=createFullscreenQuad(this.gl)}
 prepare():void{this.program??=createProgram(this.gl,VERT,FRAG);this.sampler.prepare();this.quad();this.prepared=true}
 assertPrepared():void{if(!this.prepared||!this.program||!this.geometry)throw Error('Merged Clone149 program is not prepared')}
 captureMergedSource(target:ILayerBuffer,binding:CanonicalBeginBinding,view:CanonicalBeginLayeredView,acquire:(w:number,h:number)=>CanonicalSourceLease,claim:CanonicalSourceClaim,onReleased?:()=>void,capability:CanonicalBeginCapability='cloneProjection149'){
  this.assertPrepared()
  return CanonicalBeginSource.captureMerged(target,binding,view,acquire,claim,onReleased,capability,this.sampler)
 }
 forget():void{this.prepared=false;this.program=undefined;this.geometry=undefined;this.patch=undefined;this.sampler.forget()}
 destroy():void{if(this.program)this.gl.deleteProgram(this.program);if(this.geometry)this.gl.deleteBuffer(this.geometry);this.patch?.destroy();this.sampler.destroy();this.forget()}
 paint(tile:PaintTarget,bounds:WorldRect,mask:AccumulationBuffer,scratch:BrushScratch,target:Pick<ILayerBuffer,'resolveForPaint'>&Partial<Pick<ILayerBuffer,'resolveVisible'>>,source:NonNullable<BrushSourceContext['clone']>,dab:Dab,aligned:boolean,opacity:number,projection?:CanonicalBeginSource):void{
  if(projection){projection.assertCurrent();this.assertPrepared()}else this.prepare();const gl=this.gl,left=Math.max(0,Math.floor(bounds.minX-tile.originX)),top=Math.max(0,Math.floor(bounds.minY-tile.originY)),right=Math.min(tile.buffer.width,Math.ceil(bounds.maxX-tile.originX)),bottom=Math.min(tile.buffer.height,Math.ceil(bounds.maxY-tile.originY))
  if(right<=left||bottom<=top)return
  const size=2**Math.ceil(Math.log2(Math.max(8,right-left,bottom-top)))
  if(size>2048)throw Error('Clone patch exceeds bounded tile size')
  if(this.patch?.width!==size){this.patch?.destroy();this.patch=new AccumulationBuffer(gl,size,size)}
  const dx=aligned?source.offsetX:source.x-dab.x,dy=aligned?source.offsetY:source.y-dab.y,x=tile.originX+left+dx,y=tile.originY+top+dy
  this.sampler.gather(this.patch,{minX:x,minY:y,maxX:x+size,maxY:y+size},[{opacity:1,buffer:{resolveVisible:r=>{projection?.assertCurrent();return projection?[...projection.resolveForRead(r)]:(target.resolveVisible?.(r)??target.resolveForPaint(r)).map(t=>({...t,buffer:scratch.getOrCreate(t.buffer).original}))}}}])
  projection?.assertCurrent()
  tile.buffer.beginDraw();try{
   const program=this.program!;gl.useProgram(program)
   for(const[unit,texture,name]of[[0,this.patch.texture,'u_source'],[1,mask.texture,'u_mask']]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,name),unit)}
   gl.uniform1f(gl.getUniformLocation(program,'u_opacity'),opacity);gl.uniform2f(gl.getUniformLocation(program,'u_resolution'),tile.buffer.width,tile.buffer.height);gl.uniform3f(gl.getUniformLocation(program,'u_patch'),left,top,size);gl.uniform4f(gl.getUniformLocation(program,'u_rect'),left,top,right-left,bottom-top)
   gl.bindBuffer(gl.ARRAY_BUFFER,this.quad());const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);try{gl.drawArrays(gl.TRIANGLES,0,6)}finally{gl.disableVertexAttribArray(position)}
  }finally{tile.buffer.endDraw()}
 }
}
