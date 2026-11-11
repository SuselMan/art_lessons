import type {ILayerBuffer} from '../buffers/ILayerBuffer'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {WorldRect} from '../buffers/tileMath'
import {DISPLAY_VERT} from './shaders'
import {createProgram,getUniforms} from './utils'

export interface ProjectionSampleLayer {readonly buffer:Pick<ILayerBuffer,'resolveVisible'>;readonly opacity:number}
export interface ProjectionReadSession {readonly layers:readonly ProjectionSampleLayer[];release():void}
const FRAG=`
precision highp float;
uniform sampler2D u_tile;
uniform vec4 u_patch;
uniform vec4 u_tileRect;
uniform float u_opacity;
// Enabled only for compact historical sources: x/y GL texel offset, z/w crop size.
uniform vec4 u_sourceCrop;
uniform sampler2D u_addressX;
uniform sampler2D u_addressY;
void main(){
 vec2 world=vec2(gl_FragCoord.x,u_patch.w-gl_FragCoord.y)*u_patch.z/u_patch.w;
 if(any(lessThan(world,u_tileRect.xy))||any(greaterThanEqual(world,u_tileRect.xy+u_tileRect.zw)))discard;
 vec2 local=(world-u_tileRect.xy)/u_tileRect.zw;
 if(u_sourceCrop.z>0.0){
  // Keep ORIGINAL normalization and Y cancellation before selecting a texel.
  vec2 oldUV=vec2(local.x,1.0-local.y);
  // SAME hardware NEAREST address on each original axis, including NPOT ties.
  vec2 xCode=floor(texture2D(u_addressX,vec2(oldUV.x,0.5)).rg*255.0+vec2(0.5));
  vec2 yCode=floor(texture2D(u_addressY,vec2(0.5,oldUV.y)).rg*255.0+vec2(0.5));
  vec2 texel=vec2(xCode.x+xCode.y*256.0,yCode.x+yCode.y*256.0)-u_sourceCrop.xy;
  if(any(lessThan(texel,vec2(0.0)))||any(greaterThanEqual(texel,u_sourceCrop.zw)))discard;
  gl_FragColor=texture2D(u_tile,(texel+vec2(0.5))/u_sourceCrop.zw)*u_opacity;
 }else{
 gl_FragColor=texture2D(u_tile,vec2(local.x,1.0-local.y))*u_opacity;
 }
}`

/** Samples canonical content only, never paper, display previews or viewport
 * caches. Caller supplies historical or live layer buffers and owns the bounded
 * patch. No whole-canvas composite or additional persistent tile population. */
export class CanvasProjectionSampler {
 private binding?:{program:WebGLProgram;position:number;uniforms:ReturnType<typeof getUniforms>}
 /** At most two original dimension pairs; no source pixels or scene owner. */
 private readonly addresses=new Map<string,{x:WebGLTexture;y:WebGLTexture}>()
 private readonly gl:WebGLRenderingContext
 private readonly quad:()=>WebGLBuffer
 constructor(gl:WebGLRenderingContext,quad:()=>WebGLBuffer){this.gl=gl;this.quad=quad}
 prepare():void {
  if(this.binding)return
  const gl=this.gl,program=createProgram(gl,DISPLAY_VERT,FRAG)
  this.binding={program,position:gl.getAttribLocation(program,'a_position'),uniforms:getUniforms(gl,program,['u_tile','u_patch','u_tileRect','u_opacity','u_sourceCrop','u_addressX','u_addressY'])}
 }
 /** Lost-context handles cannot be deleted meaningfully; forget only refs. */
 forget():void {this.binding=undefined;this.addresses.clear()}
 destroy():void {
  const binding=this.binding,pairs=[...this.addresses.values()]
  this.forget()
  let failed=false,first:unknown
  const attempt=(work:()=>void)=>{try{work()}catch(error){if(!failed){failed=true;first=error}}}
  if(binding)attempt(()=>this.gl.deleteProgram(binding.program))
  for(const pair of pairs){attempt(()=>this.gl.deleteTexture(pair.x));attempt(()=>this.gl.deleteTexture(pair.y))}
  if(failed)throw first
 }
 private addressTexture(width:number,height:number):WebGLTexture {
  const gl=this.gl,texture=gl.createTexture()
  if(!texture)throw Error('Projection address allocation failed')
  try{
   const count=Math.max(width,height),data=new Uint8Array(count*4)
   for(let i=0;i<count;i++){data[i*4]=i%256;data[i*4+1]=Math.floor(i/256);data[i*4+3]=255}
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture)
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,data)
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST)
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
   return texture
  }catch(error){try{gl.deleteTexture(texture)}catch{/* Preserve allocation failure, including undefined. */}throw error}
 }
 private addressPair(width:number,height:number):{x:WebGLTexture;y:WebGLTexture} {
  // RG encodes every valid index up to65535; actual GL texture bounds fit.
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>65536||height>65536)throw Error('Invalid projection address dimensions')
  const key=width+':'+height,cached=this.addresses.get(key)
  if(cached){this.addresses.delete(key);this.addresses.set(key,cached);return cached}
  if(this.addresses.size>=2){
   const oldest=this.addresses.entries().next().value!
   this.addresses.delete(oldest[0])
   let failed=false,first:unknown
   try{this.gl.deleteTexture(oldest[1].x)}catch(error){failed=true;first=error}
   try{this.gl.deleteTexture(oldest[1].y)}catch(error){if(!failed){failed=true;first=error}}
   if(failed)throw first
  }
  let x:WebGLTexture|undefined,y:WebGLTexture|undefined
  try{x=this.addressTexture(width,1);y=this.addressTexture(1,height)}
  catch(error){if(x)try{this.gl.deleteTexture(x)}catch{/* Preserve allocation failure. */}if(y)try{this.gl.deleteTexture(y)}catch{/* Preserve allocation failure. */}throw error}
  const pair={x,y};this.addresses.set(key,pair);return pair
 }
 gather(patch:AccumulationBuffer,rect:WorldRect,layers:readonly ProjectionSampleLayer[]):void {
  this.prepare();const binding=this.binding!,gl=this.gl,size=patch.width,span=rect.maxX-rect.minX
  if(size!==patch.height||span<=0||rect.maxY-rect.minY!==span)throw Error('Projection requires a bounded square patch')
  patch.clear();patch.beginDraw()
  let addressStateStarted=false,hasX=false,hasY=false,oldX:WebGLTexture|null=null,oldY:WebGLTexture|null=null,failed=false
  try {
   for(const layer of layers){
    if(layer.opacity<=0)continue
    for(const tile of layer.buffer.resolveVisible(rect)){
     const b=tile.buffer,c=tile.contentRect
     if(!c||c.maxX<=rect.minX||c.minX>=rect.maxX||c.maxY<=rect.minY||c.minY>=rect.maxY)continue
     const sourceRect=tile.projectionSourceRect
     // Virtual full geometry must also drive clipping/viewport: just outside a
     // crop edge the OLD rounded UV may still select a copied edge texel.
     const originX=sourceRect?.minX??tile.originX,originY=sourceRect?.minY??tile.originY
     const width=sourceRect?sourceRect.maxX-sourceRect.minX:b.width,height=sourceRect?sourceRect.maxY-sourceRect.minY:b.height
     if(sourceRect&&(![originX,originY,width,height,tile.originX,tile.originY,b.width,b.height].every(Number.isSafeInteger)||width<=0||height<=0||tile.originX<originX||tile.originY<originY||tile.originX+b.width>originX+width||tile.originY+b.height>originY+height))throw Error('Invalid historical projection source geometry')
     const x0=Math.max(rect.minX,originX),x1=Math.min(rect.maxX,originX+width)
     const y0=Math.max(rect.minY,originY),y1=Math.min(rect.maxY,originY+height)
     const x=Math.floor((x0-rect.minX)*size/span),right=Math.ceil((x1-rect.minX)*size/span)
     const y=Math.floor((rect.maxY-y1)*size/span),top=Math.ceil((rect.maxY-y0)*size/span)
     if(right<=x||top<=y)continue
     // The outer canonical reader only saves unit0. Preserve foreign unit1/2
     // bindings once per cropped gather, including partial acquisition failure.
     if(sourceRect&&!addressStateStarted){
      addressStateStarted=true
      gl.activeTexture(gl.TEXTURE0+1);oldX=gl.getParameter(gl.TEXTURE_BINDING_2D)as WebGLTexture|null;hasX=true
      gl.activeTexture(gl.TEXTURE0+2);oldY=gl.getParameter(gl.TEXTURE_BINDING_2D)as WebGLTexture|null;hasY=true
      gl.activeTexture(gl.TEXTURE0)
     }
     const address=sourceRect?this.addressPair(width,height):undefined
     // Resolving an evicted source may have changed the framebuffer/program.
     // Re-establish the complete sampling pass after that read resolver.
     patch.beginDraw();gl.viewport(x,y,right-x,top-y);gl.useProgram(binding.program)
     gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(binding.uniforms.u_tile,0)
     gl.uniform4f(binding.uniforms.u_patch,0,0,span,size);gl.uniform1f(binding.uniforms.u_opacity,layer.opacity)
     gl.uniform4f(binding.uniforms.u_tileRect,originX-rect.minX,originY-rect.minY,width,height)
     if(sourceRect)gl.uniform4f(binding.uniforms.u_sourceCrop,tile.originX-originX,originY+height-tile.originY-b.height,b.width,b.height)
     else gl.uniform4f(binding.uniforms.u_sourceCrop,0,0,0,0)
     if(address){
      gl.activeTexture(gl.TEXTURE0+1);gl.bindTexture(gl.TEXTURE_2D,address.x);gl.uniform1i(binding.uniforms.u_addressX,1)
      gl.activeTexture(gl.TEXTURE0+2);gl.bindTexture(gl.TEXTURE_2D,address.y);gl.uniform1i(binding.uniforms.u_addressY,2)
     }else{gl.uniform1i(binding.uniforms.u_addressX,0);gl.uniform1i(binding.uniforms.u_addressY,0)}
     // setPointSampling operates on the active unit: never modify either LUT.
     gl.activeTexture(gl.TEXTURE0)
     gl.bindBuffer(gl.ARRAY_BUFFER,this.quad());gl.enableVertexAttribArray(binding.position);gl.vertexAttribPointer(binding.position,2,gl.FLOAT,false,0,0)
     let drawFailed=false
     try{b.setPointSampling(true);gl.drawArrays(gl.TRIANGLES,0,6)}catch(error){drawFailed=true;throw error}finally{
      let cleanupFailed=false,first:unknown
      const attempt=(work:()=>void)=>{try{work()}catch(error){if(!cleanupFailed){cleanupFailed=true;first=error}}}
      attempt(()=>gl.activeTexture(gl.TEXTURE0));attempt(()=>b.setPointSampling(false))
      // No owned LUT may remain bound across the next resolver: it may
      // synchronously re-enter this sampler and evict these dimension pairs.
      if(address){
       if(hasX)attempt(()=>{gl.activeTexture(gl.TEXTURE0+1);gl.bindTexture(gl.TEXTURE_2D,oldX)})
       if(hasY)attempt(()=>{gl.activeTexture(gl.TEXTURE0+2);gl.bindTexture(gl.TEXTURE_2D,oldY)})
       attempt(()=>gl.activeTexture(gl.TEXTURE0))
      }
      // eslint-disable-next-line no-unsafe-finally -- Preserve draw/point setup failure even if cleanup throws.
      if(!drawFailed&&cleanupFailed)throw first
     }
    }
   }
  }catch(error){failed=true;throw error}finally{
   let cleanupFailed=false,first:unknown
   const attempt=(work:()=>void)=>{try{work()}catch(error){if(!cleanupFailed){cleanupFailed=true;first=error}}}
   if(hasX)attempt(()=>{gl.activeTexture(gl.TEXTURE0+1);gl.bindTexture(gl.TEXTURE_2D,oldX)})
   if(hasY)attempt(()=>{gl.activeTexture(gl.TEXTURE0+2);gl.bindTexture(gl.TEXTURE_2D,oldY)})
   if(addressStateStarted)attempt(()=>gl.activeTexture(gl.TEXTURE0))
   attempt(()=>patch.endDraw())
   // eslint-disable-next-line no-unsafe-finally -- Preserve any original body failure, including undefined.
   if(!failed&&cleanupFailed)throw first
  }
 }
}
