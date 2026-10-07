import { RIBBON_VERT, RIBBON_FRAG, DAB_VERT, DAB_FRAG } from '../raster/shaders'
import noiseAsset from '../raster/watercolorNoise.txt?raw'
import type { CanonicalRibbonBatch, CanonicalStamp } from './types'
/** Diagnostic only: production GL program, exact prepared triangle/uniform input. */
export function ribbonGlOracle(batch: CanonicalRibbonBatch, width: number, height: number) {
 const canvas = document.createElement('canvas'); canvas.width=width;canvas.height=height
 const gl=canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw new Error('WebGL oracle unavailable')
 const max=gl.getExtension('EXT_blend_minmax');if(batch.inkBlend==='max'&&!max)throw new Error('WebGL MAX oracle unavailable')
 const compile=(type:number,code:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'GL shader');return shader}
 const program=gl.createProgram()!;gl.attachShader(program,compile(gl.VERTEX_SHADER,RIBBON_VERT));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,RIBBON_FRAG));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'GL link');gl.useProgram(program)
 const texture=(w:number,h:number,bytes?:Uint8Array,luminance=false)=>{const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);const fmt=luminance?gl.LUMINANCE:gl.RGBA;gl.texImage2D(gl.TEXTURE_2D,0,fmt,w,h,0,fmt,gl.UNSIGNED_BYTE,bytes??null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
 const coverage=texture(width,height),empty=texture(width,height),noise=texture(251,251,Uint8Array.from(atob(noiseAsset),c=>c.charCodeAt(0)),true)
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const local=batch.vertices.slice();for(let i=0;i<local.length;i+=11){local[i]=batch.vertices[i]-batch.uniforms.worldOrigin[0];local[i+1]=batch.vertices[i+1]+batch.uniforms.worldOrigin[1]}gl.bufferData(gl.ARRAY_BUFFER,local,gl.STATIC_DRAW)
 const attributes=[['a_position',2,0],['a_edge',1,8],['a_ink',1,12],['a_inkWater',1,16],['a_across',1,20],['a_inkWet',1,24],['a_inkStrength',1,28],['a_contact',3,32]] as const
 for(const [name,count,offset] of attributes){const loc=gl.getAttribLocation(program,name);if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,count,gl.FLOAT,false,44,offset)}}
 const v=batch.uniforms,uniform=(name:string)=>gl.getUniformLocation(program,name)
 for(const [name,value] of Object.entries({u_aaPx:v.aaPx,u_washWater:v.washWater,u_waterRetain:v.waterRetain,u_bristleCombs:v.bristleCombs,u_bristleInk:v.bristleInk,u_cloudDeposit:v.cloudDeposit,u_granDeposit:v.granDeposit,u_poolBlot:v.poolBlot,u_useAvailableWater:+v.useAvailableWater}))gl.uniform1f(uniform(name),value)
 gl.uniform2f(uniform('u_resolution'),width,height);gl.uniform2fv(uniform('u_worldOrigin'),Array.from(v.worldOrigin));gl.uniform2fv(uniform('u_mottleSeed'),Array.from(v.mottleSeed));gl.uniform3fv(uniform('u_tau'),Array.from(v.tau))
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,noise);gl.uniform1i(uniform('u_wcNoiseTex'),1);gl.uniform1i(uniform('u_availableWater'),0)
 const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);gl.enable(gl.BLEND)
 const outputs={} as Record<'coverage'|'pigment'|'color',Uint8Array>
 for(const name of ['coverage','pigment','color'] as const){const out=name==='coverage'?coverage:texture(width,height);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,out,0);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,name==='coverage'?empty:coverage);gl.uniform1f(uniform('u_mode'),name==='coverage'?0:1);gl.uniform1f(uniform('u_depthWrite'),name==='color'?1:0);gl.blendEquation(name==='coverage'||batch.inkBlend==='add'?gl.FUNC_ADD:max!.MAX_EXT);gl.blendFunc(gl.ONE,name==='coverage'?gl.ONE_MINUS_SRC_ALPHA:gl.ONE);gl.drawArrays(gl.TRIANGLES,0,batch.vertices.length/11);const raw=new Uint8Array(width*height*4),bytes=new Uint8Array(raw.length);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,raw);for(let y=0;y<height;y++)bytes.set(raw.subarray((height-y-1)*width*4,(height-y)*width*4),y*width*4);outputs[name]=bytes}
 const error=gl.getError();gl.getExtension('WEBGL_lose_context')?.loseContext();if(error!==gl.NO_ERROR)throw new Error('GL ribbon oracle error '+error)
 return outputs
}

export function stampGlOracle(batch: CanonicalStamp, width: number, height: number) {
 const canvas = document.createElement('canvas'); canvas.width=width;canvas.height=height
 const gl=canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw new Error('WebGL oracle unavailable')
 const max=gl.getExtension('EXT_blend_minmax');if(batch.inkBlend==='max'&&!max)throw new Error('WebGL MAX oracle unavailable')
 const compile=(type:number,code:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'GL shader');return shader}
 const program=gl.createProgram()!;gl.attachShader(program,compile(gl.VERTEX_SHADER,DAB_VERT));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,DAB_FRAG));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'GL link');gl.useProgram(program)
 const texture=(w:number,h:number,bytes?:Uint8Array,luminance=false)=>{const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);const fmt=luminance?gl.LUMINANCE:gl.RGBA;gl.texImage2D(gl.TEXTURE_2D,0,fmt,w,h,0,fmt,gl.UNSIGNED_BYTE,bytes??null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
 const coverage=texture(width,height),empty=texture(width,height),noise=texture(251,251,Uint8Array.from(atob(noiseAsset),c=>c.charCodeAt(0)),true)
 const vertices=new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5])
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW)
 const loc=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,8,0)
 const v=batch.uniforms,uniform=(name:string)=>gl.getUniformLocation(program,name)
 for(const [name,value] of Object.entries({u_aaPx:v.aaPx,u_washWater:v.washWater,u_waterRetain:v.waterRetain,u_bristleCombs:v.bristleCombs,u_bristleInk:v.bristleInk,u_cloudDeposit:v.cloudDeposit,u_granDeposit:v.granDeposit,u_poolBlot:v.poolBlot,u_useAvailableWater:+v.useAvailableWater}))gl.uniform1f(uniform(name),value)
 gl.uniform2f(uniform('u_resolution'),width,height);gl.uniform2fv(uniform('u_paperOrigin'),Array.from(v.worldOrigin));gl.uniform2fv(uniform('u_mottleSeed'),Array.from(v.mottleSeed));gl.uniform3fv(uniform('u_tau'),Array.from(v.tau))
 for(const [name,value] of Object.entries({u_dabRadius:batch.radius,u_angle:batch.angle,u_aspectRatio:batch.aspect,u_pressure:batch.pressure,u_opacity:batch.opacity,u_nibShape:+(batch.nibShape==='roundedBox'),u_nibCorner:batch.cornerRadius,u_inkEdge:batch.inkEdge,u_inkWater:batch.inkWater,u_paperWet:batch.paperWet,u_inkStrength:batch.inkStrength,u_inkClip:batch.inkClip}))gl.uniform1f(uniform(name),value)
 gl.uniform2fv(uniform('u_dabCenter'),Array.from(batch.center));gl.uniform2fv(uniform('u_acrossLocal'),Array.from(batch.acrossLocal))
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,empty)
 for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++){const a=gl.getActiveUniform(program,i)!;if(a.type===gl.SAMPLER_2D)gl.uniform1i(uniform(a.name),0)}
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,noise);gl.uniform1i(uniform('u_wcNoiseTex'),1);gl.uniform1i(uniform('u_strokeCoverage'),2)
 const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);gl.enable(gl.BLEND)
 const outputs={} as Record<'coverage'|'pigment'|'color',Uint8Array>
 for(const name of ['coverage','pigment','color'] as const){const out=name==='coverage'?coverage:texture(width,height);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,out,0);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,empty);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,name==='coverage'?empty:coverage);gl.uniform1f(uniform('u_inkMode'),name==='coverage'?6:7);gl.uniform1f(uniform('u_puddle'),name==='coverage'?batch.puddle:batch.pigmentPool);gl.uniform1f(uniform('u_depthWrite'),name==='color'?1:0);gl.blendEquation(name==='coverage'||batch.inkBlend==='add'?gl.FUNC_ADD:max!.MAX_EXT);gl.blendFunc(gl.ONE,name==='coverage'?gl.ONE_MINUS_SRC_ALPHA:gl.ONE);gl.drawArrays(gl.TRIANGLES,0,6);const raw=new Uint8Array(width*height*4),bytes=new Uint8Array(raw.length);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,raw);for(let y=0;y<height;y++)bytes.set(raw.subarray((height-y-1)*width*4,(height-y)*width*4),y*width*4);outputs[name]=bytes}
 const error=gl.getError();gl.getExtension('WEBGL_lose_context')?.loseContext();if(error!==gl.NO_ERROR)throw new Error('GL ribbon oracle error '+error)
 return outputs
}
