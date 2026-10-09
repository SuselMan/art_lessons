import {DISPLAY_VERT,WC_DIFFUSE_FRAG,WC_WATER_FRONT_FRAG} from './shaders'
import {createProgram,getUniforms} from './utils'
import {diagnosticWebgl2Raw} from './diagnosticWebgl2'
import type {WatercolorPassesContext} from './WatercolorPasses'
const height=`vec2 paperUV = (px + u_paperOrigin) / u_paperTexSize * u_paperScale;\n    return texture2D(u_paperHeightMap, paperUV).r;`
const cachedHeight='return texture2D(u_staticPaper, px / u_resolution).r;'
export const WC_STATIC_DIFFUSE_FRAG=WC_DIFFUSE_FRAG.replace('uniform sampler2D u_paperHeightMap;', 'uniform sampler2D u_paperHeightMap;\n  uniform sampler2D u_staticPaper;').replace(height,cachedHeight)
const climb=`float climb = u_climb * (1.0 + WC_FRONT_FEATHER * smoothstep(WC_FRONT_FEATHER_LO, WC_FRONT_FEATHER_HI,\n      wcFbm((px + u_paperOrigin) * WC_FRONT_FEATHER_SCALE + vec2(41.0, 7.0))));`
export const WC_STATIC_FRONT_FRAG=WC_WATER_FRONT_FRAG.replace('uniform sampler2D u_paperHeightMap;', 'uniform sampler2D u_paperHeightMap;\n  uniform sampler2D u_staticPaper;').replace(height,cachedHeight).replace(climb,'float climb = texture2D(u_staticPaper, v_uv).g;')
export const WC_STATIC_PAPER_PREP_FRAG=WC_WATER_FRONT_FRAG.slice(0,WC_WATER_FRONT_FRAG.indexOf('  void main()'))+`  void main(){vec2 px=v_uv*u_resolution;float hj=wcFrontHeightAt(px);${climb}gl_FragColor=vec4(hj,climb,0.0,1.0);}`
export interface StaticPaperParameters {w:number;h:number;origin:readonly[number,number];paperSize:readonly[number,number];paperScale:number;climb:number}
interface Program {program:WebGLProgram;uniforms:Record<string,WebGLUniformLocation|null>;position:number}
/** OFF-only float cache. Original programs remain completely unchanged.
 * Neighbor-coordinate equality is a required primitive gate, NOT assumed universally. */
export class StaticPaperCache {
 private readonly ctx:WatercolorPassesContext
 private texture:WebGLTexture|null=null;private fbo:WebGLFramebuffer|null=null
 private key:StaticPaperParameters|null=null;private paper:WebGLTexture|null=null;private noiseOwner:unknown=null
 private prep:Program|null=null;private readonly programs=new Map<'front'|'diffuse',Program>()
 readonly stats={prepares:0,hits:0,fallbacks:0,bytes:0,reason:''}
 constructor(ctx:WatercolorPassesContext){this.ctx=ctx}
 private program(kind:'front'|'diffuse'|'prep'):Program {
  if(kind==='prep'&&this.prep)return this.prep
  if(kind!=='prep'&&this.programs.has(kind))return this.programs.get(kind)!
  const gl=this.ctx.gl(),program=createProgram(gl,DISPLAY_VERT,kind==='prep'?WC_STATIC_PAPER_PREP_FRAG:kind==='front'?WC_STATIC_FRONT_FRAG:WC_STATIC_DIFFUSE_FRAG)
  const result={program,uniforms:getUniforms(gl,program,['u_staticPaper','u_resolution','u_paperOrigin','u_paperTexSize','u_paperScale','u_climb','u_wcNoiseTex','u_cost','u_film','u_foreignFilm','u_foreignWet','u_dryCost','u_floor','u_costMax','u_stride','u_ink','u_coverage','u_d','u_b','u_radius','u_stencil','u_paperHeightMap']),position:gl.getAttribLocation(program,'a_position')}
  if(kind==='prep')this.prep=result;else this.programs.set(kind,result)
  return result
 }
 ensure(p:StaticPaperParameters,budget:number):boolean {
  const gl=this.ctx.gl(),raw=diagnosticWebgl2Raw(gl),bytes=p.w*p.h*(raw?8:16),paper=this.ctx.paperTex(),noiseOwner=this.ctx.stamps()
  if(![p.w,p.h].every(n=>Number.isInteger(n)&&n>0)||![...p.origin,...p.paperSize,p.paperScale,p.climb].every(Number.isFinite)||p.paperSize.some(n=>n<=0))return this.fallback('invalid cache parameters')
  if(bytes>budget)return this.fallback('float cache exceeds explicit budget')
  if(this.texture&&this.paper===paper&&this.noiseOwner===noiseOwner&&JSON.stringify(this.key)===JSON.stringify(p)){this.stats.hits++;return true}
  if((gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision??0)<23)return this.fallback('fragment highp has less than23bits')
  if(raw?!raw.getExtension('EXT_color_buffer_float'):!(gl.getExtension('OES_texture_float')&&gl.getExtension('WEBGL_color_buffer_float')))return this.fallback('renderable Float32 unavailable')
  const previousFbo=gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer|null,viewport=gl.getParameter(gl.VIEWPORT) as Int32Array
  try{
   if(!this.texture||this.key?.w!==p.w||this.key?.h!==p.h){this.releaseTexture();this.texture=gl.createTexture();this.fbo=gl.createFramebuffer();if(!this.texture||!this.fbo)throw Error('cache allocation failed');gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(raw)raw.texImage2D(raw.TEXTURE_2D,0,raw.RG32F,p.w,p.h,0,raw.RG,raw.FLOAT,null);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,p.w,p.h,0,gl.RGBA,gl.FLOAT,null)}
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Float32 framebuffer incomplete')
   const state=this.program('prep'),u=state.uniforms;gl.viewport(0,0,p.w,p.h);gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.useProgram(state.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.ctx.screenBuf());gl.enableVertexAttribArray(state.position);gl.vertexAttribPointer(state.position,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,paper);gl.uniform1i(u.u_paperHeightMap,1);this.ctx.stamps().bindNoise(u.u_wcNoiseTex);gl.uniform2f(u.u_resolution,p.w,p.h);gl.uniform2f(u.u_paperOrigin,...p.origin);gl.uniform2f(u.u_paperTexSize,...p.paperSize);gl.uniform2f(u.u_paperScale,p.paperScale,p.paperScale);gl.uniform1f(u.u_climb,p.climb);gl.drawArrays(gl.TRIANGLES,0,6)
   this.key={...p,origin:[...p.origin],paperSize:[...p.paperSize]};this.paper=paper;this.noiseOwner=noiseOwner;this.stats.prepares++;this.stats.bytes=bytes;this.stats.reason='';return true
  }catch(e){this.releaseTexture();return this.fallback(String(e))}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previousFbo);gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]);gl.activeTexture(gl.TEXTURE0)}
 }
 /** DEV read-only actual prepared operand descriptor; no allocation or prepare. */
 diagnosticPreparedOperands(){return this.texture&&this.fbo&&this.key?{texture:this.texture,fbo:this.fbo,width:this.key.w,height:this.key.h,channels:diagnosticWebgl2Raw(this.ctx.gl())?2:4,parameters:{...this.key,origin:[...this.key.origin],paperSize:[...this.key.paperSize]}}:null}
 bind(kind:'front'|'diffuse'):Program {const state=this.program(kind),gl=this.ctx.gl();gl.useProgram(state.program);gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(state.uniforms.u_staticPaper,6);gl.activeTexture(gl.TEXTURE0);return state}
 private fallback(reason:string){this.stats.fallbacks++;this.stats.reason=reason;return false}
 private releaseTexture(){const gl=this.ctx.gl();if(this.texture)gl.deleteTexture(this.texture);if(this.fbo)gl.deleteFramebuffer(this.fbo);this.texture=null;this.fbo=null;this.key=null;this.paper=null;this.noiseOwner=null;this.stats.bytes=0}
 destroy(){this.releaseTexture();const gl=this.ctx.gl();if(this.prep)gl.deleteProgram(this.prep.program);for(const p of this.programs.values())gl.deleteProgram(p.program);this.prep=null;this.programs.clear()}
}
