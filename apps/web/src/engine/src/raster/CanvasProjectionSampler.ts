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
void main(){
 vec2 world=vec2(gl_FragCoord.x,u_patch.w-gl_FragCoord.y)*u_patch.z/u_patch.w;
 if(any(lessThan(world,u_tileRect.xy))||any(greaterThanEqual(world,u_tileRect.xy+u_tileRect.zw)))discard;
 vec2 local=(world-u_tileRect.xy)/u_tileRect.zw;
 gl_FragColor=texture2D(u_tile,vec2(local.x,1.0-local.y))*u_opacity;
}`

/** Samples canonical content only, never paper, display previews or viewport
 * caches. Caller supplies historical or live layer buffers and owns the bounded
 * patch. No whole-canvas composite or additional persistent tile population. */
export class CanvasProjectionSampler {
 private binding?:{program:WebGLProgram;position:number;uniforms:ReturnType<typeof getUniforms>}
 private readonly gl:WebGLRenderingContext
 private readonly quad:()=>WebGLBuffer
 constructor(gl:WebGLRenderingContext,quad:()=>WebGLBuffer){this.gl=gl;this.quad=quad}
 prepare():void {
  if(this.binding)return
  const gl=this.gl,program=createProgram(gl,DISPLAY_VERT,FRAG)
  this.binding={program,position:gl.getAttribLocation(program,'a_position'),uniforms:getUniforms(gl,program,['u_tile','u_patch','u_tileRect','u_opacity'])}
 }
 forget():void {this.binding=undefined}
 destroy():void {if(this.binding)this.gl.deleteProgram(this.binding.program);this.forget()}
 gather(patch:AccumulationBuffer,rect:WorldRect,layers:readonly ProjectionSampleLayer[]):void {
  this.prepare();const binding=this.binding!,gl=this.gl,size=patch.width,span=rect.maxX-rect.minX
  if(size!==patch.height||span<=0||rect.maxY-rect.minY!==span)throw Error('Projection requires a bounded square patch')
  patch.clear();patch.beginDraw()
  try {
   for(const layer of layers){
    if(layer.opacity<=0)continue
    for(const tile of layer.buffer.resolveVisible(rect)){
     const b=tile.buffer,c=tile.contentRect
     if(!c||c.maxX<=rect.minX||c.minX>=rect.maxX||c.maxY<=rect.minY||c.minY>=rect.maxY)continue
     const x0=Math.max(rect.minX,tile.originX),x1=Math.min(rect.maxX,tile.originX+b.width)
     const y0=Math.max(rect.minY,tile.originY),y1=Math.min(rect.maxY,tile.originY+b.height)
     const x=Math.floor((x0-rect.minX)*size/span),right=Math.ceil((x1-rect.minX)*size/span)
     const y=Math.floor((rect.maxY-y1)*size/span),top=Math.ceil((rect.maxY-y0)*size/span)
     if(right<=x||top<=y)continue
     // Resolving an evicted source may have changed the framebuffer/program.
     // Re-establish the complete sampling pass after that read resolver.
     patch.beginDraw();gl.viewport(x,y,right-x,top-y);gl.useProgram(binding.program)
     gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(binding.uniforms.u_tile,0)
     gl.uniform4f(binding.uniforms.u_patch,0,0,span,size);gl.uniform1f(binding.uniforms.u_opacity,layer.opacity)
     gl.uniform4f(binding.uniforms.u_tileRect,tile.originX-rect.minX,tile.originY-rect.minY,b.width,b.height)
     gl.bindBuffer(gl.ARRAY_BUFFER,this.quad());gl.enableVertexAttribArray(binding.position);gl.vertexAttribPointer(binding.position,2,gl.FLOAT,false,0,0)
     b.setPointSampling(true)
     try{gl.drawArrays(gl.TRIANGLES,0,6)}finally{b.setPointSampling(false)}
    }
   }
  }finally{patch.endDraw()}
 }
}
