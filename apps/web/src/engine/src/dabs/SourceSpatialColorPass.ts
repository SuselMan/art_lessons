import {canonicalSourceColorNoiseByte,type CanonicalSourceSpatialColor,type CanonicalSourceColorFieldDraw,type CanonicalMaterialParameters} from '@grafetto/shared'
import {BRUSH_LIGHTNESS_GLSL} from '../raster/brushBehaviorShaders'
/** Resource-local program, prepared and charged by the SAME prepass owner. No
 * cached GL state, source grant, allocation or lifetime issuance. */
export class SourceSpatialColorPass {
 readonly program:WebGLProgram
 readonly attribute!:number
 private readonly uniforms:Record<string,WebGLUniformLocation|null>=Object.create(null)
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){
  this.gl=gl
  const shaders:WebGLShader[]=[];let program:WebGLProgram|null=null,failed=false,primary:unknown
  try{
   for(const[type,source]of [[gl.VERTEX_SHADER,`attribute vec2 position;uniform vec2 size;void main(){gl_Position=vec4(position/size*2.0-1.0,0.0,1.0);}`],[gl.FRAGMENT_SHADER,`precision highp float;precision highp sampler2D;
${BRUSH_LIGHTNESS_GLSL}
uniform sampler2D mask;uniform sampler2D field;uniform vec2 allocation;uniform vec2 fieldSize;uniform vec2 period;uniform vec2 offset;uniform vec2 crop;uniform vec3 material;uniform vec3 sharpness;
void main(){vec2 p=floor(gl_FragCoord.xy);vec4 m=floor(texture2D(mask,(p+0.5)/allocation)*255.0+0.5);vec2 q=mod(mod(p+offset,period)+period,period);vec4 c=floor(texture2D(field,(crop+q+0.5)/fieldSize)*255.0+0.5);float a=material.x<0.5?m.r:m.a;if(sharpness.z>0.5){float tolerance=floor(255.0-sharpness.x*255.0);a=a>tolerance?255.0:a<=floor((100.0-sharpness.y)*tolerance/100.0)?0.0:a;}if(material.x>1.5)c=vec4(m.rgb,255.0*material.z);else if(material.x>0.5){c.rgb=brushMaterialColor(c.rgb/255.0,m.r/255.0,material.y)*255.0;a=min(a,c.a);}float n=a*c.a+128.0;float alpha=material.x>0.5&&material.x<1.5?a:floor((n+floor(n/256.0))/256.0);gl_FragColor=vec4(c.rgb,alpha)/255.0;}`]]as const){const shader=gl.createShader(type);if(!shader)throw new Error('Spatial shader allocation failed');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Spatial shader compile failed: '+gl.getShaderInfoLog(shader))}
   program=gl.createProgram();if(!program)throw new Error('Spatial program allocation failed');for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Spatial program link failed: '+gl.getProgramInfoLog(program));this.attribute=gl.getAttribLocation(program,'position');if(this.attribute<0)throw new Error('Spatial position unavailable');for(const name of ['size','mask','field','allocation','fieldSize','period','offset','crop','material','sharpness'])this.uniforms[name]=gl.getUniformLocation(program,name)
  }catch(error){failed=true;primary=error}
  for(const shader of shaders)try{gl.deleteShader(shader)}catch(error){if(!failed){failed=true;primary=error}}
  if(failed){if(program)try{gl.deleteProgram(program)}catch{}throw primary}this.program=program!
 }
 draw(args:{mask:WebGLTexture;field:WebGLTexture;target:WebGLFramebuffer;width:number;height:number;allocationWidth:number;allocationHeight:number;fieldWidth:number;fieldHeight:number;periodX:number;periodY:number;offsetX:number;offsetY:number;cropX:number;cropY:number;buffer:WebGLBuffer;vertices:Float32Array;parameters?:CanonicalMaterialParameters;material?:{kind:'lightness-map-v1'|'color-stamp-v1';strength:number;foregroundAlpha:number}}):void{
  const gl=this.gl,u=this.uniforms,a=args;gl.bindFramebuffer(gl.FRAMEBUFFER,a.target);gl.viewport(0,0,a.width,a.height);for(const cap of[gl.BLEND,gl.SCISSOR_TEST,gl.DITHER,gl.CULL_FACE,gl.DEPTH_TEST,gl.STENCIL_TEST])gl.disable(cap);gl.colorMask(true,true,true,true);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,a.buffer);a.vertices.set([0,0,a.width,0,0,a.height,0,a.height,a.width,0,a.width,a.height]);gl.bufferSubData(gl.ARRAY_BUFFER,0,a.vertices.subarray(0,12));gl.enableVertexAttribArray(this.attribute);gl.vertexAttribPointer(this.attribute,2,gl.FLOAT,false,0,0);for(const[unit,texture,uniform]of[[0,a.mask,u.mask],[1,a.field,u.field]]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniform,unit)}gl.uniform2f(u.size,a.width,a.height);gl.uniform2f(u.allocation,a.allocationWidth,a.allocationHeight);gl.uniform2f(u.fieldSize,a.fieldWidth,a.fieldHeight);gl.uniform2f(u.period,a.periodX,a.periodY);gl.uniform2f(u.offset,a.offsetX,a.offsetY);gl.uniform2f(u.crop,a.cropX,a.cropY);gl.uniform3f(u.material,a.material?(a.material.kind==='lightness-map-v1'?1:2):0,a.material?.strength??0,a.material?.foregroundAlpha??1);gl.uniform3f(u.sharpness,a.parameters?.sharpnessThreshold??0,a.parameters?.sharpnessSoftness??0,a.parameters?.sharpnessChecked?1:0);gl.drawArrays(gl.TRIANGLES,0,6)
 }
 destroy(lost=false):void{if(!lost)this.gl.deleteProgram(this.program)}
}
/** Caller reserves exact transient bytes BEFORE allocating; no mutable RNG state. */
export function fillSourceSpatialNoise(bytes:Uint8Array,width:number,height:number,provider:CanonicalSourceSpatialColor,draw:CanonicalSourceColorFieldDraw):void{
 if(provider.kind!=='total-random-rgb8-hash-v1'||bytes.length!==width*height*4)throw new TypeError('Invalid spatial noise target')
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=4*(y*width+x);for(const channel of[0,1,2]as const)bytes[i+channel]=canonicalSourceColorNoiseByte(draw.seed,x,y,width,channel);bytes[i+3]=255}
}
