import type{PolygonGeometry}from'../presets/brushExperiment'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{createProgram}from'../raster/utils'
const VERT=`attribute vec2 a_position;uniform vec2 u_resolution;uniform vec2 u_shift;void main(){vec2 p=(a_position+u_shift)/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision mediump float;uniform float u_weight;void main(){gl_FragColor=vec4(u_weight);}`
/** One shared depth/stencil renderbuffer, detached from pooled FBOs in finally.
 * Fan signed coverage implements nonzero winding; inversion implements parity. */
export class PolygonFillBatch{
 private readonly gl:WebGLRenderingContext
 private program?:WebGLProgram
 private vertices?:WebGLBuffer
 private quad?:WebGLBuffer
 private stencil?:WebGLRenderbuffer
 private width=0
 private height=0
 private data=new Float32Array(2048*3*2)
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 reset():void{this.program=undefined;this.vertices=undefined;this.quad=undefined;this.stencil=undefined;this.width=0;this.height=0}
 destroy():void{const gl=this.gl;if(this.program)gl.deleteProgram(this.program);if(this.vertices)gl.deleteBuffer(this.vertices);if(this.quad)gl.deleteBuffer(this.quad);if(this.stencil)gl.deleteRenderbuffer(this.stencil);this.reset()}
 prepare():void{this.program??=createProgram(this.gl,VERT,FRAG);this.vertices??=this.gl.createBuffer()!;this.quad??=this.gl.createBuffer()!}
 paintMask(target:AccumulationBuffer,geometry:PolygonGeometry,originX:number,originY:number):void{
  this.prepare();const gl=this.gl,p=this.program!,points=geometry.points,cull=gl.isEnabled(gl.CULL_FACE),depth=gl.isEnabled(gl.DEPTH_TEST),scissor=gl.isEnabled(gl.SCISSOR_TEST),oldScissor=gl.getParameter(gl.SCISSOR_BOX)as Int32Array
  gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.disable(gl.SCISSOR_TEST);target.clear();target.beginDraw()
  let position=-1
  try{
   this.stencil??=gl.createRenderbuffer()!;gl.bindRenderbuffer(gl.RENDERBUFFER,this.stencil)
   if(this.width!==target.width||this.height!==target.height){gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_STENCIL,target.width,target.height);this.width=target.width;this.height=target.height}
   gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.RENDERBUFFER,this.stencil)
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Polygon stencil framebuffer unavailable')
   let minX=target.width,minY=target.height,maxX=0,maxY=0
   for(const q of points){minX=Math.min(minX,Math.floor(q.x-originX-1));minY=Math.min(minY,Math.floor(q.y-originY-1));maxX=Math.max(maxX,Math.ceil(q.x-originX+1));maxY=Math.max(maxY,Math.ceil(q.y-originY+1))}
   minX=Math.max(0,minX);minY=Math.max(0,minY);maxX=Math.min(target.width,maxX);maxY=Math.min(target.height,maxY)
   gl.enable(gl.SCISSOR_TEST);gl.scissor(minX,target.height-maxY,Math.max(0,maxX-minX),Math.max(0,maxY-minY))
   gl.useProgram(p);gl.uniform2f(gl.getUniformLocation(p,'u_resolution'),target.width,target.height);position=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(position)
   const samples=geometry.hardEdge?[[0,0]]:[[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]]
   for(const shift of samples){
    gl.stencilMask(255);gl.clearStencil(0);gl.clear(gl.STENCIL_BUFFER_BIT);gl.enable(gl.STENCIL_TEST);gl.colorMask(false,false,false,false);gl.disable(gl.BLEND);gl.stencilFunc(gl.ALWAYS,0,255)
    gl.stencilOpSeparate(gl.FRONT,gl.KEEP,gl.KEEP,geometry.winding?gl.INCR_WRAP:gl.INVERT);gl.stencilOpSeparate(gl.BACK,gl.KEEP,gl.KEEP,geometry.winding?gl.DECR_WRAP:gl.INVERT)
    gl.uniform2f(gl.getUniformLocation(p,'u_shift'),shift[0],shift[1]);gl.uniform1f(gl.getUniformLocation(p,'u_weight'),0)
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vertices!);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
    let count=0
    const flush=()=>{if(count){gl.bufferData(gl.ARRAY_BUFFER,this.data.subarray(0,count*2),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,count);count=0}}
    for(let i=1;i+1<points.length;i++){if(count===2048*3)flush();for(const q of[points[0],points[i],points[i+1]]){this.data[count*2]=q.x-originX;this.data[count*2+1]=q.y-originY;count++}}flush()
    gl.colorMask(true,true,true,true);gl.stencilMask(0);gl.stencilFunc(gl.NOTEQUAL,0,255);gl.stencilOp(gl.KEEP,gl.KEEP,gl.KEEP);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE)
    gl.uniform2f(gl.getUniformLocation(p,'u_shift'),0,0);gl.uniform1f(gl.getUniformLocation(p,'u_weight'),1/samples.length)
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad!);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,target.width,0,0,target.height,0,target.height,target.width,0,target.width,target.height]),gl.STREAM_DRAW);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6)
   }
  }finally{
   if(position>=0)gl.disableVertexAttribArray(position);gl.colorMask(true,true,true,true);gl.stencilMask(255);gl.disable(gl.STENCIL_TEST);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.RENDERBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);if(cull)gl.enable(gl.CULL_FACE);if(depth)gl.enable(gl.DEPTH_TEST);gl.scissor(oldScissor[0],oldScissor[1],oldScissor[2],oldScissor[3]);if(scissor)gl.enable(gl.SCISSOR_TEST);else gl.disable(gl.SCISSOR_TEST);target.endDraw()
  }
 }
}
