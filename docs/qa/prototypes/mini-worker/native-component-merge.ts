/** QA-only GPU common-C merge. Every array/texture uses GL bottom-up rows. */
export interface NativeMergeMapping {mode:'forward'|'authored';maxOriginalCode?:number}
export function nativeMergeRational(mapping:NativeMergeMapping){
 if(mapping.mode==='forward')return{numerator:1,denominator:1}
 const max=mapping.maxOriginalCode
 if(mapping.mode!=='authored'||typeof max!=='number'||!Number.isInteger(max)||max<0||max>255)throw Error('Invalid frozen native source scale')
 return max>=128?{numerator:255,denominator:max}:{numerator:2,denominator:1}
}
export function mapNativeMergeCode(byte:number,mapping:NativeMergeMapping){
 if(!Number.isInteger(byte)||byte<0||byte>255)throw Error('Invalid native byte')
 const {numerator,denominator}=nativeMergeRational(mapping)
 return Math.min(255,Math.floor((byte*numerator+Math.floor(denominator/2))/denominator))
}
/** Proof-arm only, outside primary timing. Never interpret this display clamp as conserved mass. */
export function mapNativeMergePixels(pixels:Uint8Array,mapping:NativeMergeMapping){
 if(!(pixels instanceof Uint8Array)||pixels.length%4!==0)throw Error('Invalid native RGBA pixels')
 const {numerator,denominator}=nativeMergeRational(mapping),rgba=new Uint8Array(pixels.length)
 let saturatedChannels=0,saturatedPixels=0
 for(let i=0;i<pixels.length;i+=4){let clipped=false;for(let k=0;k<4;k++){const raw=Math.floor((pixels[i+k]*numerator+Math.floor(denominator/2))/denominator);if(raw>255){saturatedChannels++;clipped=true}rgba[i+k]=Math.min(255,raw)}if(clipped)saturatedPixels++}
 return{rgba,saturatedChannels,saturatedPixels}
}
export const NATIVE_COMPONENT_MERGE_FRAG=`precision highp float;
uniform highp sampler2D u_previous;uniform highp sampler2D u_component;uniform highp sampler2D u_mask;
uniform vec2 u_size;uniform vec2 u_ratio;
void main(){vec2 uv=gl_FragCoord.xy/u_size;if(texture2D(u_mask,uv).r<=0.0){gl_FragColor=texture2D(u_previous,uv);return;}vec4 bytes=floor(texture2D(u_component,uv)*255.0+0.5);vec4 N=bytes*u_ratio.x;vec4 q=floor(N/u_ratio.y);vec4 r=N-q*u_ratio.y;vec4 below=vec4(lessThan(r,vec4(0.0)));q-=below;r+=below*u_ratio.y;vec4 above=step(vec4(u_ratio.y),r);q+=above;r-=above*u_ratio.y;vec4 code=min(vec4(255.0),q+step(vec4(u_ratio.y),2.0*r));gl_FragColor=code/255.0;}`
export function createNativeComponentMerge(gl:WebGLRenderingContext,width:number,height:number,options:NativeMergeMapping&{baseCommonRGBA:Uint8Array}){
 const N=width*height,ratio=nativeMergeRational(options)
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||N>1024*1024||!(options.baseCommonRGBA instanceof Uint8Array)||options.baseCommonRGBA.length!==N*4)throw Error('Invalid bounded merge dimensions/base')
 if(gl.isContextLost())throw Error('Merge context lost')
 const ext=gl.getExtension('OES_vertex_array_object'),precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)
 if(!ext||!precision||precision.precision<23)throw Error('Merge requires isolated VAO and highp23')
 const caps=[gl.BLEND,gl.SCISSOR_TEST,gl.DEPTH_TEST,gl.STENCIL_TEST,gl.CULL_FACE,gl.DITHER,gl.SAMPLE_COVERAGE,gl.SAMPLE_ALPHA_TO_COVERAGE]
 const pixelKeys=[gl.PACK_ALIGNMENT,gl.UNPACK_ALIGNMENT,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_COLORSPACE_CONVERSION_WEBGL]
 const scoped=<T>(work:()=>T):T=>{
  if(gl.isContextLost())throw Error('Merge context lost')
  const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Merge pre-existing GL error '+error)
  const fbo=gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport=gl.getParameter(gl.VIEWPORT),program=gl.getParameter(gl.CURRENT_PROGRAM),vao=gl.getParameter(ext.VERTEX_ARRAY_BINDING_OES),array=gl.getParameter(gl.ARRAY_BUFFER_BINDING),active=gl.getParameter(gl.ACTIVE_TEXTURE),mask=gl.getParameter(gl.COLOR_WRITEMASK),enabled=caps.map(c=>gl.isEnabled(c)),pixels=pixelKeys.map(k=>gl.getParameter(k)),bindings=[]
  for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);bindings.push(gl.getParameter(gl.TEXTURE_BINDING_2D))}
  try{return work()}finally{
   gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]);gl.useProgram(program);ext.bindVertexArrayOES(vao);gl.bindBuffer(gl.ARRAY_BUFFER,array)
   for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,bindings[i])}gl.activeTexture(active)
   caps.forEach((c,i)=>enabled[i]?gl.enable(c):gl.disable(c));gl.colorMask(mask[0],mask[1],mask[2],mask[3]);pixelKeys.forEach((k,i)=>gl.pixelStorei(k,pixels[i]))
  }
 }
 let dead=false,begun=false,current=0,program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null,vao:WebGLVertexArrayObjectOES|null=null,vertex:WebGLShader|null=null,fragment:WebGLShader|null=null
 const textures:WebGLTexture[]=[],fbos:WebGLFramebuffer[]=[]
 let base:WebGLTexture,copy:WebGLTexture,mask:WebGLTexture,targets:WebGLTexture[],readFbo:WebGLFramebuffer,writeFbo:WebGLFramebuffer,previousUniform:WebGLUniformLocation,componentUniform:WebGLUniformLocation,maskUniform:WebGLUniformLocation,sizeUniform:WebGLUniformLocation,ratioUniform:WebGLUniformLocation
 const dispose=()=>{if(dead)return;dead=true;for(const f of fbos)gl.deleteFramebuffer(f);for(const t of textures)gl.deleteTexture(t);if(vao)ext.deleteVertexArrayOES(vao);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);if(vertex)gl.deleteShader(vertex);if(fragment)gl.deleteShader(fragment)}
 const check=()=>{const e=gl.getError();if(gl.isContextLost()||e!==gl.NO_ERROR)throw Error('Merge GL error '+e)}
 const attach=(f:WebGLFramebuffer,t:WebGLTexture|null)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(t&&gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Merge incomplete FBO')}
 const ready=()=>{if(dead||!begun)throw Error('Merge begin required')}
 try{scoped(()=>{
  const compile=(type:number,source:string)=>{const s=gl.createShader(type);if(!s)throw Error('Merge shader allocation');try{gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Merge shader '+gl.getShaderInfoLog(s));return s}catch(e){gl.deleteShader(s);throw e}}
  vertex=compile(gl.VERTEX_SHADER,'attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}')
  fragment=compile(gl.FRAGMENT_SHADER,NATIVE_COMPONENT_MERGE_FRAG);program=gl.createProgram();if(!program)throw Error('Merge program allocation');gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Merge link '+gl.getProgramInfoLog(program))
  buffer=gl.createBuffer();vao=ext.createVertexArrayOES();if(!buffer||!vao)throw Error('Merge geometry allocation');ext.bindVertexArrayOES(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const position=gl.getAttribLocation(program,'a_position');if(position<0)throw Error('Merge position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
  const uniform=(name:string)=>{const v=gl.getUniformLocation(program!,name);if(v===null)throw Error('Merge uniform '+name);return v};previousUniform=uniform('u_previous');componentUniform=uniform('u_component');maskUniform=uniform('u_mask');sizeUniform=uniform('u_size');ratioUniform=uniform('u_ratio')
  gl.activeTexture(gl.TEXTURE0);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE)
  const texture=(format:number,pixels:Uint8Array|null)=>{const t=gl.createTexture();if(!t)throw Error('Merge texture allocation');textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,format,width,height,0,format,gl.UNSIGNED_BYTE,pixels);return t}
  base=texture(gl.RGBA,new Uint8Array(options.baseCommonRGBA));copy=texture(gl.RGBA,null);mask=texture(gl.LUMINANCE,null);targets=[texture(gl.RGBA,null),texture(gl.RGBA,null)]
  const fbo=()=>{const f=gl.createFramebuffer();if(!f)throw Error('Merge FBO allocation');fbos.push(f);return f};readFbo=fbo();writeFbo=fbo();attach(writeFbo,targets[0]);check()
 })}catch(e){dispose();throw e}
 return{
  metadata:{rows:'gl-bottom-up',sourceMaskContract:'original four-connected solventA+foreignA>0 component; caller supplies proved immutable partition mask',mapping:{...ratio},quantization:'exact integer-valued highp quotient/remainder half-up, saturated RGBA8 display; not pigment ledger',scope:'prepared input to ready common-C texture; excludes full raw read/hash; includes borrowed-C exact copy, mask upload, merge and one-pixel dependency',ownedTextureBytes:N*17},
  get texture(){ready();return targets[current]},
  begin(){if(dead)throw Error('Destroyed merge');begun=false;scoped(()=>{attach(readFbo,base);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets[0]);gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,width,height);attach(readFbo,null);check()});current=0;begun=true},
  merge(component:WebGLTexture,componentMask:Uint8Array){ready();if(!component||textures.includes(component)||!(componentMask instanceof Uint8Array)||componentMask.length!==N)throw Error('Invalid/aliased merge source or mask');scoped(()=>{try{
   attach(readFbo,component);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,copy);gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,width,height);attach(readFbo,null)
   gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,mask);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.LUMINANCE,gl.UNSIGNED_BYTE,componentMask)
   attach(writeFbo,targets[1-current]);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets[current]);gl.useProgram(program);ext.bindVertexArrayOES(vao);gl.uniform1i(previousUniform,0);gl.uniform1i(componentUniform,1);gl.uniform1i(maskUniform,2);gl.uniform2f(sizeUniform,width,height);gl.uniform2f(ratioUniform,ratio.numerator,ratio.denominator);caps.forEach(c=>gl.disable(c));gl.colorMask(true,true,true,true);gl.viewport(0,0,width,height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);check()
  }finally{attach(readFbo,null)}});current=1-current},
  dependency(){ready();return scoped(()=>{attach(readFbo,targets[current]);gl.pixelStorei(gl.PACK_ALIGNMENT,1);const a=new Uint8Array(4);try{gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);check();return a}finally{attach(readFbo,null)}})},
  readback(){ready();return scoped(()=>{attach(readFbo,targets[current]);gl.pixelStorei(gl.PACK_ALIGNMENT,1);const a=new Uint8Array(N*4);try{gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,a);check();return a}finally{attach(readFbo,null)}})},
  destroy(){dispose()}
 }
}
