import {DAB_VERT,DAB_FRAG,RIBBON_VERT,RIBBON_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import noiseAsset from '../../../../apps/web/src/engine/src/raster/watercolorNoise.txt?raw'
import type {CanonicalDrawCommand} from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
/** Persistent original GL coverage target. No material/settle or shader rewrite. */
export function createCoverageGlSequence(){
 const side=1024,canvas=document.createElement('canvas');canvas.width=canvas.height=side
 const gl=canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('GL coverage unavailable')
 const programs:WebGLProgram[]=[],shaders:WebGLShader[]=[],textures:WebGLTexture[]=[]
 const program=(vert:string,frag:string)=>{const p=gl.createProgram()!;for(const [type,text]of [[gl.VERTEX_SHADER,vert],[gl.FRAGMENT_SHADER,frag]] as const){const s=gl.createShader(type)!;gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)??'compile');gl.attachShader(p,s);shaders.push(s)}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)??'link');programs.push(p);return p}
 const ribbon=program(RIBBON_VERT,RIBBON_FRAG),stamp=program(DAB_VERT,DAB_FRAG)
 const texture=(w:number,h:number,data:Uint8Array|null=null,luma=false)=>{const t=gl.createTexture()!;textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);const fmt=luma?gl.LUMINANCE:gl.RGBA;gl.texImage2D(gl.TEXTURE_2D,0,fmt,w,h,0,fmt,gl.UNSIGNED_BYTE,data);for(const n of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,n,gl.NEAREST);for(const n of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,n,gl.CLAMP_TO_EDGE);return t}
 const coverage=texture(side,side),empty=texture(side,side),noise=texture(251,251,Uint8Array.from(atob(noiseAsset),x=>x.charCodeAt(0)),true)
 const fbo=gl.createFramebuffer()!,buffer=gl.createBuffer()!;gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,coverage,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Coverage framebuffer incomplete');gl.viewport(0,0,side,side);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.DITHER);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)
 return{
 draw(command:CanonicalDrawCommand){
  const isRibbon=command.kind==='ribbon',p=isRibbon?ribbon:stamp;gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,buffer)
  const attrs=[['a_position',2,0],['a_edge',1,8],['a_ink',1,12],['a_inkWater',1,16],['a_across',1,20],['a_inkWet',1,24],['a_inkStrength',1,28],['a_contact',3,32]] as const
  for(let i=0;i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);i++)gl.disableVertexAttribArray(i)
  if(isRibbon){const batch=command.batch,local=batch.vertices.slice();for(let i=0;i<local.length;i+=11){local[i]-=batch.uniforms.worldOrigin[0];local[i+1]+=batch.uniforms.worldOrigin[1]}gl.bufferData(gl.ARRAY_BUFFER,local,gl.STATIC_DRAW);for(const [name,n,o]of attrs){const a=gl.getAttribLocation(p,name);if(a>=0){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,n,gl.FLOAT,false,44,o)}}}
  else{gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);const a=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,8,0)}
  const v=isRibbon?command.batch.uniforms:command.stamp.uniforms,u=(name:string)=>gl.getUniformLocation(p,name),one=(name:string,n:number)=>gl.uniform1f(u(name),n)
  for(const [name,n]of Object.entries({u_aaPx:v.aaPx,u_washWater:v.washWater,u_waterRetain:v.waterRetain,u_bristleCombs:v.bristleCombs,u_bristleInk:v.bristleInk,u_cloudDeposit:v.cloudDeposit,u_granDeposit:v.granDeposit,u_poolBlot:v.poolBlot,u_useAvailableWater:+v.useAvailableWater}))one(name,n)
  gl.uniform2f(u('u_resolution'),side,side);gl.uniform2fv(u(isRibbon?'u_worldOrigin':'u_paperOrigin'),Array.from(v.worldOrigin));gl.uniform2fv(u('u_mottleSeed'),Array.from(v.mottleSeed));gl.uniform3fv(u('u_tau'),Array.from(v.tau));one('u_depthWrite',0)
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,empty);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,noise);gl.uniform1i(u('u_wcNoiseTex'),1)
  if(isRibbon){gl.uniform1i(u('u_availableWater'),0);one('u_mode',0)}else{const s=command.stamp;for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const a=gl.getActiveUniform(p,i)!;if(a.type===gl.SAMPLER_2D)gl.uniform1i(u(a.name),0)}gl.uniform1i(u('u_wcNoiseTex'),1);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,empty);gl.uniform1i(u('u_strokeCoverage'),2);for(const [name,n]of Object.entries({u_dabRadius:s.radius,u_angle:s.angle,u_aspectRatio:s.aspect,u_pressure:s.pressure,u_opacity:s.opacity,u_nibShape:+(s.nibShape==='roundedBox'),u_nibCorner:s.cornerRadius,u_inkEdge:s.inkEdge,u_inkWater:s.inkWater,u_paperWet:s.paperWet,u_inkStrength:s.inkStrength,u_inkClip:s.inkClip,u_inkMode:6,u_puddle:s.puddle}))one(name,n);gl.uniform2fv(u('u_dabCenter'),Array.from(s.center));gl.uniform2fv(u('u_acrossLocal'),Array.from(s.acrossLocal))}
  gl.drawArrays(gl.TRIANGLES,0,isRibbon?command.batch.vertices.length/11:6)
 },
 read(){const raw=new Uint8Array(side*side*4),out=new Uint8Array(raw.length);gl.readPixels(0,0,side,side,gl.RGBA,gl.UNSIGNED_BYTE,raw);for(let y=0;y<side;y++)out.set(raw.subarray((side-y-1)*side*4,(side-y)*side*4),y*side*4);const error=gl.getError();if(error)throw Error('GL coverage '+error);return out},
 destroy(){gl.deleteBuffer(buffer);gl.deleteFramebuffer(fbo);for(const t of textures)gl.deleteTexture(t);for(const p of programs)gl.deleteProgram(p);for(const s of shaders)gl.deleteShader(s);gl.getExtension('WEBGL_lose_context')?.loseContext()}
 }
}
