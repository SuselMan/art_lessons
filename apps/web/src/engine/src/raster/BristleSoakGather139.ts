import type {CanonicalBeginResult} from '../dabs/CanonicalBeginRuntime'
import type {SprayScratchLease} from '../dabs/SprayRequestPainter'
import {bristleSoakStraight139} from '../presets/bristleSoak139'
import {createProgram} from './utils'
const VERT='attribute vec2 a_atlas;attribute vec2 a_uv;varying highp vec2 v_uv;void main(){v_uv=a_uv;gl_Position=vec4((a_atlas+.5)/64.*2.-1.,0.,1.);gl_PointSize=1.;}'
const FRAG='precision highp float;uniform highp sampler2D u_source;varying highp vec2 v_uv;void main(){gl_FragColor=texture2D(u_source,v_uv);}'
/** One transient pool atlas, <=4096 points, one readPixels per successful gesture.
 * Draw calls are per intersecting source tile, never per hair. No source copies. */
export class BristleSoakGather139 {
 private program?:WebGLProgram
 private buffer?:WebGLBuffer
 private vao?:WebGLVertexArrayObjectOES
 private extension?:OES_vertex_array_object
 private busy=false
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 prepare():void {
  if(this.busy)throw Error('Bristle gather busy')
  if(this.program&&this.buffer&&this.vao)return
  const gl=this.gl,extension=gl.getExtension('OES_vertex_array_object')
  if(!extension||gl.getParameter(gl.MAX_TEXTURE_SIZE)<64)throw Error('Bristle gather capabilities unavailable')
  // Compilation/allocation only in selected/recorded preflight, never in gather.
  this.extension=extension;this.program??=createProgram(gl,VERT,FRAG)
  this.buffer??=gl.createBuffer()??undefined;this.vao??=extension.createVertexArrayOES()??undefined
  if(!this.buffer||!this.vao)throw Error('Bristle gather preparation unavailable')
 }
 assertPrepared():void {if(!this.program||!this.buffer||!this.vao||!this.extension)throw Error('Bristle gather is not prepared')}
 reset():void {
  if(this.busy)throw Error('Bristle gather busy')
  const gl=this.gl;let failed=false,primary:unknown
  for(const action of[()=>{if(this.program)gl.deleteProgram(this.program)},()=>{if(this.buffer)gl.deleteBuffer(this.buffer)},()=>{if(this.vao)this.extension?.deleteVertexArrayOES(this.vao)}])try{action()}catch(error){if(!failed){failed=true;primary=error}}
  this.program=undefined;this.buffer=undefined;this.vao=undefined;this.extension=undefined
  if(failed)throw primary
 }
 gather(view:Extract<CanonicalBeginResult,{kind:'ready'}>['view'],points:readonly{x:number;y:number}[],acquire:()=>SprayScratchLease):Uint8Array {
  this.assertPrepared()
  if(this.busy||points.length<1||points.length>4096||points.some(p=>!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)))throw Error('Invalid Bristle gather request')
  const gl=this.gl,ext=this.extension!,program=this.program!
  let lease:SprayScratchLease|undefined,restore:(()=>void)|undefined,failed=false,primary:unknown,result:Uint8Array|undefined
  const attempt=(action:()=>void)=>{try{action()}catch(error){if(!failed){failed=true;primary=error}}}
  this.busy=true
  try{
   view.assertCurrent()
   // CPU membership is frozen; missing pixels remain transparent. Validate ALL
   // geometry and uniqueness before a pool allocation or framebuffer effect.
   const claimed=new Uint8Array(points.length),groups:{texture:WebGLTexture;data:Float32Array}[]=[]
   for(const tile of view.tiles){
    const {buffer,originX,originY}=tile,w=buffer.width,h=buffer.height
    if(![originX,originY,w,h].every(Number.isSafeInteger)||w<1||h<1)throw Error('Invalid Bristle source tile')
    const data:number[]=[]
    for(let i=0;i<points.length;i++){const p=points[i];if(p.x<originX||p.y<originY||p.x>=originX+w||p.y>=originY+h)continue
     if(claimed[i])throw Error('Overlapping Bristle source membership');claimed[i]=1
     data.push(i%64,Math.floor(i/64),(p.x-originX+.5)/w,1-(p.y-originY+.5)/h)
    }
    if(data.length)groups.push({texture:buffer.texture,data:new Float32Array(data)})
   }
   const fbo=gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer|null,pack=gl.getParameter(gl.PACK_ALIGNMENT) as number,viewport=gl.getParameter(gl.VIEWPORT) as Int32Array,previousProgram=gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram|null,buffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer|null,vao=gl.getParameter(ext.VERTEX_ARRAY_BINDING_OES) as WebGLVertexArrayObjectOES|null
   const unit=gl.getParameter(gl.ACTIVE_TEXTURE) as number,texture=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null,mask=gl.getParameter(gl.COLOR_WRITEMASK) as boolean[],clear=gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array
   const caps=[gl.BLEND,gl.DEPTH_TEST,gl.STENCIL_TEST,gl.SCISSOR_TEST,gl.CULL_FACE,gl.DITHER,gl.SAMPLE_ALPHA_TO_COVERAGE,gl.SAMPLE_COVERAGE],enabled=caps.map(cap=>gl.isEnabled(cap))
   let texture0:WebGLTexture|null=null,texture0Known=false
   restore=()=>{
    attempt(()=>ext.bindVertexArrayOES(vao));attempt(()=>gl.bindBuffer(gl.ARRAY_BUFFER,buffer));attempt(()=>gl.useProgram(previousProgram))
    if(texture0Known){attempt(()=>gl.activeTexture(gl.TEXTURE0));attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture0))}attempt(()=>gl.activeTexture(unit));attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture))
    attempt(()=>gl.pixelStorei(gl.PACK_ALIGNMENT,pack));attempt(()=>gl.colorMask(mask[0],mask[1],mask[2],mask[3]));attempt(()=>gl.clearColor(clear[0],clear[1],clear[2],clear[3]));caps.forEach((cap,i)=>attempt(()=>{if(enabled[i])gl.enable(cap);else gl.disable(cap)}));attempt(()=>gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]));attempt(()=>gl.bindFramebuffer(gl.FRAMEBUFFER,fbo))
   }
   gl.activeTexture(gl.TEXTURE0);texture0=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null;texture0Known=true;gl.activeTexture(unit)
   lease=acquire();lease.assertCurrent();view.assertCurrent()
   if(lease.buffer.width!==64||lease.buffer.height!==64||groups.some(g=>g.texture===lease!.buffer.texture))throw Error('Invalid distinct Bristle atlas lease')
   gl.activeTexture(gl.TEXTURE0)
   gl.bindFramebuffer(gl.FRAMEBUFFER,lease.buffer.fbo)
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Bristle atlas framebuffer incomplete')
   ext.bindVertexArrayOES(this.vao!);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer!);gl.useProgram(program);gl.viewport(0,0,64,64);caps.forEach(cap=>gl.disable(cap));gl.colorMask(true,true,true,true);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)
   const position=gl.getAttribLocation(program,'a_atlas'),uv=gl.getAttribLocation(program,'a_uv')
   for(const[location,offset]of[[position,0],[uv,8]]){if(location>=0){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,16,offset)}}
   gl.uniform1i(gl.getUniformLocation(program,'u_source'),0)
   for(const group of groups){view.assertCurrent();lease.assertCurrent();gl.bindTexture(gl.TEXTURE_2D,group.texture);gl.bufferData(gl.ARRAY_BUFFER,group.data,gl.STREAM_DRAW);gl.drawArrays(gl.POINTS,0,group.data.length/4)}
   const pma=new Uint8Array(16384);gl.pixelStorei(gl.PACK_ALIGNMENT,1);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pma)
   if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error('Bristle readback/context failed')
   view.assertCurrent();lease.assertCurrent();result=bristleSoakStraight139(pma,points.length)
  }catch(error){failed=true;primary=error}
  finally{attempt(()=>lease?.release());attempt(()=>restore?.());this.busy=false}
  if(failed)throw primary
  return result!
 }
}
