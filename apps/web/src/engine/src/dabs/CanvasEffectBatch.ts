import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{DeformRequest}from'../presets/brushDeform'
import{createProgram}from'../raster/utils'
const VERT=`attribute vec2 a_position;uniform vec2 u_resolution;uniform vec4 u_rect;void main(){vec2 p=(u_rect.xy+(a_position*.5+.5)*u_rect.zw)/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision highp float;uniform sampler2D u_source;uniform sampler2D u_noise;uniform vec2 u_resolution;uniform vec2 u_center;uniform vec2 u_sourceCenter;uniform vec2 u_radius;uniform vec2 u_rotation;uniform vec3 u_sourceRect;uniform vec4 u_params;uniform vec2 u_delta;uniform vec3 u_flags;uniform vec2 u_noiseOffset;
void main(){vec2 pixel=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y),p=pixel-u_center;float c=u_rotation.x,s=u_rotation.y;vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y);float d=dot(q/u_radius,q/u_radius);if(d>1.)discard;
vec4 noise=texture2D(u_noise,(pixel+u_noiseOffset)/256.);if(u_flags.y<=0.||noise.b>u_flags.y)discard;
float mode=u_params.x,amount=u_params.z;
if(mode<2.5){float f=(u_params.y<0.?-1.:1.)*(abs((1.-d)*u_params.y)+d);if(abs(f)<.000001)discard;q/=f;}
else if(mode<4.5){float a=-u_params.y*(1.-d),ca=cos(a),sa=sin(a);q=vec2(ca*q.x-sa*q.y,sa*q.x+ca*q.y);}
else if(mode<5.5)q-=u_delta*amount*(1.-d);
else if(mode<7.5){float rr=dot(q,q)/(u_params.w*u_params.w),f=1.+amount*rr;q=mode>6.5?q*f:q/f;}
else q+=(noise.rg*2.-1.)*amount;
vec2 coord=u_sourceCenter+vec2(c*q.x-s*q.y,s*q.x+c*q.y)-u_sourceRect.xy;if(u_flags.x<.5)coord=floor(coord)+.5;vec2 uv=vec2(coord.x/u_sourceRect.z,1.-coord.y/u_sourceRect.z);vec4 color=(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)?vec4(0.):texture2D(u_source,uv);gl_FragColor=color*u_flags.z;}`
/** Canvas sampling effects share the existing mixer gather/scratch lifecycle.
 * COPY uses constant-alpha destination attenuation, preserving transparent
 * source pixels without a second destination texture or a GPU readback. */
export class CanvasEffectBatch{
 private readonly gl:WebGLRenderingContext
 private program?:WebGLProgram
 private quad?:WebGLBuffer
 private noise?:WebGLTexture
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 assertPrepared():void{if(!this.program||!this.quad||!this.noise)throw Error('Canvas effect is not prepared')}
 reset():void{this.program=undefined;this.quad=undefined;this.noise=undefined}
 destroy():void{const gl=this.gl;if(this.program)gl.deleteProgram(this.program);if(this.quad)gl.deleteBuffer(this.quad);if(this.noise)gl.deleteTexture(this.noise);this.reset()}
 prepare():void{
  const gl=this.gl;this.program??=createProgram(gl,VERT,FRAG)
  if(!this.quad){this.quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)}
  if(!this.noise){const old=gl.getParameter(gl.TEXTURE_BINDING_2D)as WebGLTexture|null;this.noise=gl.createTexture()!;const data=new Uint8Array(256*256*4);let state=0x6d2b79f5;for(let i=0;i<data.length;i+=4){for(let k=0;k<3;k++){state^=state<<13;state^=state>>>17;state^=state<<5;data[i+k]=state>>>24}data[i+3]=255}gl.bindTexture(gl.TEXTURE_2D,this.noise);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,256,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.bindTexture(gl.TEXTURE_2D,old)}
 }
 paint(request:DeformRequest,target:AccumulationBuffer,originX:number,originY:number,source:AccumulationBuffer,opacity:number,copy:boolean):void{
  this.prepare();const gl=this.gl,p=this.program!,r=request;target.beginDraw();if(copy){gl.blendColor(0,0,0,opacity);gl.blendFunc(gl.ONE,gl.ONE_MINUS_CONSTANT_ALPHA)}gl.useProgram(p)
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);gl.uniform1i(gl.getUniformLocation(p,'u_source'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.noise!);gl.uniform1i(gl.getUniformLocation(p,'u_noise'),1)
  gl.uniform2f(gl.getUniformLocation(p,'u_resolution'),target.width,target.height);gl.uniform4f(gl.getUniformLocation(p,'u_rect'),r.bounds.minX-originX,r.bounds.minY-originY,r.bounds.maxX-r.bounds.minX,r.bounds.maxY-r.bounds.minY);gl.uniform2f(gl.getUniformLocation(p,'u_center'),r.x-originX,r.y-originY);gl.uniform2f(gl.getUniformLocation(p,'u_sourceCenter'),r.sourceX-originX,r.sourceY-originY);gl.uniform2f(gl.getUniformLocation(p,'u_radius'),r.radiusX,r.radiusY);gl.uniform2f(gl.getUniformLocation(p,'u_rotation'),Math.cos(r.angle),Math.sin(r.angle));gl.uniform3f(gl.getUniformLocation(p,'u_sourceRect'),r.source.minX-originX,r.source.minY-originY,r.span);gl.uniform4f(gl.getUniformLocation(p,'u_params'),r.mode,r.factor,r.amount,r.referenceRadius);gl.uniform2f(gl.getUniformLocation(p,'u_delta'),r.deltaX,r.deltaY);gl.uniform3f(gl.getUniformLocation(p,'u_flags'),r.bilinear?1:0,r.density,opacity);gl.uniform2f(gl.getUniformLocation(p,'u_noiseOffset'),originX%256+(r.seed&255),originY%256+((r.seed>>>8)&255))
  gl.bindBuffer(gl.ARRAY_BUFFER,this.quad!);const position=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
  try{gl.drawArrays(gl.TRIANGLES,0,6)}finally{gl.disableVertexAttribArray(position);gl.blendColor(0,0,0,0);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);target.endDraw()}
 }
}
