import{FUNCTIONAL_LAB152_GLSL}from'./functionalLab152GLSL'
import{createProgram,createFullscreenQuad}from'../raster/utils'
import{planCloneHealing152,type CloneHealing152Plan}from'./cloneHealing152Math'
import{CanvasProjectionSampler}from'../raster/CanvasProjectionSampler'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{PaintTarget}from'../buffers/ILayerBuffer'
import type{WorldRect}from'../buffers/tileMath'
import type{CanonicalBeginSource,CanonicalSourceLease,CanonicalSourceClaim}from'./CanonicalBeginSource'
import type{CanonicalBeginNotReady}from'./CanonicalBeginRuntime'
const VERT='attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}'
const COMMON=`precision highp float;
uniform vec2 u_size;uniform vec2 u_outputSize;uniform float u_storage;uniform int u_channel;
vec4 packRatio(float v){if(v<=0.)return vec4(0.);float e=floor(log2(v)),m=floor((v/exp2(e)-1.)*8388608.+.5);if(m<0.){e-=1.;m=floor((v/exp2(e)-1.)*8388608.+.5);}if(m>=8388608.){m=0.;e+=1.;}return vec4(mod(m,256.),mod(floor(m/256.),256.),floor(m/65536.),e+127.)/255.;}
float unpackRatio(vec4 c){vec4 b=floor(c*255.+.5);if(b.a==0.)return 0.;return(1.+dot(b.rgb,vec3(1.,256.,65536.))/8388608.)*exp2(b.a-127.);}
${FUNCTIONAL_LAB152_GLSL}float component(vec3 v){return u_channel==0?v.r:(u_channel==1?v.g:v.b);}
vec2 sourceUv(){return vec2(gl_FragCoord.x,u_storage-u_size.y+gl_FragCoord.y)/u_storage;}
`
const INITIAL=COMMON+`uniform sampler2D u_source;uniform sampler2D u_guide;void main(){vec2 p=sourceUv();float s=component(lab16(texture2D(u_source,p))),g=component(lab16(texture2D(u_guide,p)));gl_FragColor=packRatio(g/max(s,1.));}`
const ITERATE=COMMON+`uniform sampler2D u_ratio;void main(){vec2 p=gl_FragCoord.xy/u_size;float c=unpackRatio(texture2D(u_ratio,p));if(gl_FragCoord.x<1.||gl_FragCoord.y<1.||gl_FragCoord.x>u_size.x-1.||gl_FragCoord.y>u_size.y-1.){gl_FragColor=packRatio(c);return;}vec2 d=1./u_size;float sum=unpackRatio(texture2D(u_ratio,p+vec2(d.x,0.)))+unpackRatio(texture2D(u_ratio,p-vec2(d.x,0.)))+unpackRatio(texture2D(u_ratio,p+vec2(0.,d.y)))+unpackRatio(texture2D(u_ratio,p-vec2(0.,d.y)));gl_FragColor=packRatio((sum+2.*c)/6.);}`
const COMPOSITE_VERT=`attribute vec2 a_position;uniform vec2 u_resolution;uniform vec4 u_rect;void main(){vec2 p=(u_rect.xy+(a_position*.5+.5)*u_rect.zw)/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const COMPOSITE_FRAG=`precision highp float;uniform sampler2D u_healed;uniform sampler2D u_mask;uniform vec2 u_resolution;uniform vec4 u_patchRect;uniform float u_opacity;void main(){vec2 local=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y),p=(local-u_patchRect.xy)/u_patchRect.zw;gl_FragColor=texture2D(u_healed,vec2(p.x,1.-p.y))*texture2D(u_mask,gl_FragCoord.xy/u_resolution).a*u_opacity;}`
const FINAL=COMMON+`uniform sampler2D u_source;uniform sampler2D u_ratioL;uniform sampler2D u_ratioA;uniform sampler2D u_ratioB;void main(){vec4 s=texture2D(u_source,vec2(gl_FragCoord.x,u_storage-u_outputSize.y+gl_FragCoord.y)/u_storage);vec2 p=vec2(gl_FragCoord.x,u_size.y-u_outputSize.y+gl_FragCoord.y)/u_size;vec3 ratios=vec3(unpackRatio(texture2D(u_ratioL,p)),unpackRatio(texture2D(u_ratioA,p)),unpackRatio(texture2D(u_ratioB,p)));vec3 outLab=floor(clamp(ratios*max(lab16(s),vec3(1.)),0.,65535.));gl_FragColor=vec4(fromLab16(outLab)*s.a,s.a);}`
/** Request-scoped functional Healing. Native weighted Jacobi mechanism;
 * D65 sRGB Lab16 approximation, fixed100, no ICC/early-stop identity claim. */
export class CloneHealingPass152{
 private readonly gl:WebGLRenderingContext
 private sampler:CanvasProjectionSampler
 private quad?:WebGLBuffer
 private programs:WebGLProgram[]=[]
 constructor(gl:WebGLRenderingContext){this.gl=gl;this.sampler=new CanvasProjectionSampler(gl,()=>{if(!this.quad)throw Error('Healing not prepared');return this.quad})}
 prepare():void{
  const gl=this.gl,p=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)
  if(!p||p.precision<23||p.rangeMin<16||p.rangeMax<16)throw Error('Healing152 requires highp23/range16')
  if(this.programs.length)return
  let failed=false;try{this.quad=createFullscreenQuad(gl);for(const frag of[INITIAL,ITERATE,FINAL])this.programs.push(createProgram(gl,VERT,frag));this.programs.push(createProgram(gl,COMPOSITE_VERT,COMPOSITE_FRAG));this.sampler.prepare()}catch(e){failed=true;throw e}finally{if(failed)try{this.destroy()}catch{/* Preserve preparation primary, including undefined. */}}
 }
 assertPrepared():void{if(this.programs.length!==4||!this.quad)throw Error('Healing152 not prepared')}
 /** WHOLE actual logical rect (positive integerWxH; tiny normalization is native-aligned). Never invoke independently for destination tiles.
  * Source offset already integer-rounded under captured Clone coordinates.
  * consume synchronously performs existing mask/opacity OVER; output cannot escape. */
 withHealedPatch<T>(source:CanonicalBeginSource,rect:WorldRect,offset:{x:number;y:number},acquire:(w:number,h:number)=>CanonicalSourceLease,claim:CanonicalSourceClaim,consume:(patch:AccumulationBuffer,rect:WorldRect)=>T,forbiddenTextures:ReadonlySet<WebGLTexture>=new Set()):{kind:'ready';value:T}|CanonicalBeginNotReady{
  this.assertPrepared();source.assertCurrent();let plan:CloneHealing152Plan|null
  try{plan=planCloneHealing152(rect)}catch(error){if(!(error instanceof RangeError))throw error;return{kind:'notReady',reason:'resource',retryKey:source.binding.prefixKey+':healing-geometry',detail:'geometry'}}
  if(!plan||![offset.x,offset.y].every(Number.isSafeInteger))return{kind:'notReady',reason:'resource',retryKey:source.binding.prefixKey+':healing-geometry',detail:'geometry'}
  const{paintWidth:w,paintHeight:h,solveWidth:sw,solveHeight:sh,storageSide:n}=plan
  const sourceStorageRect={minX:rect.minX+offset.x,minY:rect.minY+offset.y,maxX:rect.minX+offset.x+n,maxY:rect.minY+offset.y+n},guideStorageRect={minX:plan.guideRect.minX,minY:plan.guideRect.minY,maxX:plan.guideRect.minX+n,maxY:plan.guideRect.minY+n}
  if(![...Object.values(sourceStorageRect),...Object.values(guideStorageRect)].every(Number.isSafeInteger))return{kind:'notReady',reason:'resource',retryKey:source.binding.prefixKey+':healing-geometry',detail:'geometry'}

  if(source.tiles.some(t=>t.buffer.gl!==this.gl))throw Error('Healing source GL mismatch')
  const reservation=claim(plan.bytes);if(typeof reservation!=='function')return reservation
  const gl=this.gl,leases:CanonicalSourceLease[]=[];let failed=false,restore:(()=>void)|undefined
  try{
   // Installed BEFORE acquire; pool mutation/throw cannot lose caller state.
   const framebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING),program=gl.getParameter(gl.CURRENT_PROGRAM),viewport=gl.getParameter(gl.VIEWPORT),array=gl.getParameter(gl.ARRAY_BUFFER_BINDING),active=gl.getParameter(gl.ACTIVE_TEXTURE),mask=gl.getParameter(gl.COLOR_WRITEMASK),scissorBox=gl.getParameter(gl.SCISSOR_BOX),clearColor=gl.getParameter(gl.COLOR_CLEAR_VALUE)
   const units:[number,WebGLTexture|null][]=[]
   const blend=[gl.BLEND_SRC_RGB,gl.BLEND_DST_RGB,gl.BLEND_SRC_ALPHA,gl.BLEND_DST_ALPHA,gl.BLEND_EQUATION_RGB,gl.BLEND_EQUATION_ALPHA].map(p=>gl.getParameter(p))
   const attributes=Array.from({length:gl.getParameter(gl.MAX_VERTEX_ATTRIBS)as number},(_,index)=>({index,enabled:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_ENABLED),buffer:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),size:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_SIZE),type:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_TYPE),normalized:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_NORMALIZED),stride:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_STRIDE),offset:gl.getVertexAttribOffset(index,gl.VERTEX_ATTRIB_ARRAY_POINTER)}))
   const flags=[gl.BLEND,gl.DITHER,gl.SCISSOR_TEST,gl.DEPTH_TEST,gl.STENCIL_TEST].map(flag=>[flag,gl.isEnabled(flag)]as const)
   restore=()=>{let bad=false,primary:unknown;const attempt=(f:()=>void)=>{try{f()}catch(e){if(!bad){bad=true;primary=e}}};for(const[unit,texture]of units){attempt(()=>gl.activeTexture(unit));attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture))}for(const[flag,on]of flags)attempt(()=>on?gl.enable(flag):gl.disable(flag));attempt(()=>gl.activeTexture(active));attempt(()=>gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer));attempt(()=>gl.useProgram(program));attempt(()=>gl.blendFuncSeparate(blend[0],blend[1],blend[2],blend[3]));attempt(()=>gl.blendEquationSeparate(blend[4],blend[5]));for(const a of attributes){if(a.buffer){attempt(()=>gl.bindBuffer(gl.ARRAY_BUFFER,a.buffer));attempt(()=>gl.vertexAttribPointer(a.index,a.size,a.type,a.normalized,a.stride,a.offset))}attempt(()=>a.enabled?gl.enableVertexAttribArray(a.index):gl.disableVertexAttribArray(a.index))}attempt(()=>gl.bindBuffer(gl.ARRAY_BUFFER,array));attempt(()=>gl.viewport(...Array.from(viewport)as[number,number,number,number]));attempt(()=>gl.clearColor(...Array.from(clearColor)as[number,number,number,number]));attempt(()=>gl.scissor(...Array.from(scissorBox)as[number,number,number,number]));attempt(()=>gl.colorMask(...Array.from(mask)as[boolean,boolean,boolean,boolean]));if(bad)throw primary}
   try{for(let i=0;i<4;i++){gl.activeTexture(gl.TEXTURE0+i);units.push([gl.TEXTURE0+i,gl.getParameter(gl.TEXTURE_BINDING_2D)])}}finally{gl.activeTexture(active)}
   const outputs=new Set<WebGLTexture>(),originals=new Set(source.tiles.map(t=>t.buffer.texture))
   const take=(width:number,height:number)=>{const lease=acquire(width,height);leases.push(lease);lease.assertCurrent();if(lease.buffer.width!==width||lease.buffer.height!==height||originals.has(lease.buffer.texture)||outputs.has(lease.buffer.texture)||forbiddenTextures.has(lease.buffer.texture))throw Error('Healing scratch alias/dimensions');outputs.add(lease.buffer.texture);return lease.buffer}
   const s=take(n,n),g=take(n,n),a=[take(sw,sh),take(sw,sh),take(sw,sh)],b=[take(sw,sh),take(sw,sh),take(sw,sh)],out=take(w,h)
   const layer={opacity:1,buffer:{resolveVisible:(r:WorldRect)=>{source.assertCurrent();return[...source.resolveForRead(r)]}}}
   for(const flag of[gl.DITHER,gl.SCISSOR_TEST,gl.DEPTH_TEST,gl.STENCIL_TEST])gl.disable(flag);gl.colorMask(true,true,true,true);gl.blendEquation(gl.FUNC_ADD)
   if(plan.expanded){
    // Clear ALL storage before scissoredgather: borrowed pool contents are never source.
    s.clear();gl.enable(gl.SCISSOR_TEST);gl.scissor(0,n-h,w,h)
    try{this.sampler.gather(s,sourceStorageRect,[layer])}finally{gl.disable(gl.SCISSOR_TEST)}
   }else this.sampler.gather(s,sourceStorageRect,[layer])
   this.sampler.gather(g,guideStorageRect,[layer]);source.assertCurrent()
   const draw=(dest:AccumulationBuffer,p:WebGLProgram,textures:readonly(readonly[string,WebGLTexture])[],channel=0)=>{
    for(const lease of leases)lease.assertCurrent();dest.beginReplaceDraw()
    try{for(const flag of[gl.BLEND,gl.DITHER,gl.SCISSOR_TEST,gl.DEPTH_TEST,gl.STENCIL_TEST])gl.disable(flag);gl.colorMask(true,true,true,true);gl.viewport(0,0,dest.width,dest.height);gl.useProgram(p);gl.uniform2f(gl.getUniformLocation(p,'u_size'),sw,sh);gl.uniform2f(gl.getUniformLocation(p,'u_outputSize'),w,h);gl.uniform1f(gl.getUniformLocation(p,'u_storage'),n);gl.uniform1i(gl.getUniformLocation(p,'u_channel'),channel)
     textures.forEach(([name,t],unit)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(p,name),unit)});gl.bindBuffer(gl.ARRAY_BUFFER,this.quad!);const position=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(position);try{gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6)}finally{gl.disableVertexAttribArray(position)}
    }finally{dest.endDraw()}
   }
   for(let k=0;k<3;k++)draw(a[k],this.programs[0],[['u_source',s.texture],['u_guide',g.texture]],k)
   let current=a,next=b;for(let iteration=0;iteration<100;iteration++){for(let k=0;k<3;k++)draw(next[k],this.programs[1],[['u_ratio',current[k].texture]],k);[current,next]=[next,current]}
   draw(out,this.programs[2],[['u_source',s.texture],['u_ratioL',current[0].texture],['u_ratioA',current[1].texture],['u_ratioB',current[2].texture]])
   source.assertCurrent();const value=consume(out,rect);source.assertCurrent();return{kind:'ready',value}
  }catch(error){failed=true;throw error}finally{
   let bad=false,primary:unknown;const attempt=(f:()=>void)=>{try{f()}catch(e){if(!bad){bad=true;primary=e}}};for(const lease of leases)attempt(()=>lease.release());attempt(reservation);if(restore)attempt(restore);if(!failed&&bad)throw primary
  }
 }
 /** Full request is solved ONCE, then cropped only at final raster transfer.
  * Mask=existing actual brush alpha at each destination tile; opacity applied once. */
 paintRequest(source:CanonicalBeginSource,rect:WorldRect,offset:{x:number;y:number},destinations:readonly{tile:PaintTarget;mask:AccumulationBuffer}[],opacity:number,acquire:(w:number,h:number)=>CanonicalSourceLease,claim:CanonicalSourceClaim):{kind:'ready';value:number}|CanonicalBeginNotReady{
  this.assertPrepared();source.assertCurrent()
  if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('Healing opacity')
  const protectedTextures=new Set<WebGLTexture>(),keys=new Set<string>()
  for(const{tile,mask}of destinations){const key=JSON.stringify([tile.originX,tile.originY]);if(keys.has(key)||tile.buffer.gl!==this.gl||mask.gl!==this.gl||mask.width!==tile.buffer.width||mask.height!==tile.buffer.height)throw Error('Healing destination/mask');keys.add(key);protectedTextures.add(tile.buffer.texture);protectedTextures.add(mask.texture)}
  if(!destinations.length)return{kind:'ready',value:0}
  return this.withHealedPatch(source,rect,offset,acquire,claim,patch=>this.compositePreparedPatch(source,patch,rect,destinations,opacity),protectedTextures)
 }
 /** Synchronous borrowed patch only; caller must invoke within withHealedPatch. */
 compositePreparedPatch(source:CanonicalBeginSource,patch:AccumulationBuffer,rect:WorldRect,destinations:readonly{tile:PaintTarget;mask:AccumulationBuffer}[],opacity:number):number{
  this.assertPrepared();source.assertCurrent();if(patch.gl!==this.gl||patch.width!==rect.maxX-rect.minX||patch.height!==rect.maxY-rect.minY||!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('Healing prepared patch dimensions/opacity')
  const sourceTextures=new Set(source.tiles.map(t=>t.buffer.texture));if(sourceTextures.has(patch.texture))throw Error('Healing prepared patch source alias')
  const seen=new Set<WebGLTexture>();for(const{tile,mask}of destinations){if(seen.has(tile.buffer.texture)||tile.buffer.gl!==this.gl||mask.gl!==this.gl||mask.width!==tile.buffer.width||mask.height!==tile.buffer.height||tile.buffer.texture===patch.texture||mask.texture===patch.texture||sourceTextures.has(tile.buffer.texture))throw Error('Healing prepared transfer alias/dimensions');seen.add(tile.buffer.texture)}

   const gl=this.gl,p=this.programs[3];let painted=0
   for(const{tile,mask}of destinations){
    const left=Math.max(0,Math.floor(rect.minX-tile.originX)),top=Math.max(0,Math.floor(rect.minY-tile.originY)),right=Math.min(tile.buffer.width,Math.ceil(rect.maxX-tile.originX)),bottom=Math.min(tile.buffer.height,Math.ceil(rect.maxY-tile.originY))
    if(right<=left||bottom<=top)continue
    source.assertCurrent();tile.buffer.beginDraw()
    try{gl.viewport(0,0,tile.buffer.width,tile.buffer.height);gl.useProgram(p);gl.uniform2f(gl.getUniformLocation(p,'u_resolution'),tile.buffer.width,tile.buffer.height);gl.uniform4f(gl.getUniformLocation(p,'u_rect'),left,top,right-left,bottom-top);gl.uniform4f(gl.getUniformLocation(p,'u_patchRect'),rect.minX-tile.originX,rect.minY-tile.originY,patch.width,patch.height);gl.uniform1f(gl.getUniformLocation(p,'u_opacity'),opacity)
     for(const[unit,texture,name]of[[0,patch.texture,'u_healed'],[1,mask.texture,'u_mask']]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(p,name),unit)}
     gl.bindBuffer(gl.ARRAY_BUFFER,this.quad!);const position=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(position);try{gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6);painted++}finally{gl.disableVertexAttribArray(position)}
    }finally{tile.buffer.endDraw()}
   }
   return painted
 }
 forget():void{this.programs=[];this.quad=undefined;this.sampler.forget()}
 destroy():void{let bad=false,primary:unknown;for(const f of[...this.programs.map(p=>()=>this.gl.deleteProgram(p)),()=>{if(this.quad)this.gl.deleteBuffer(this.quad)},()=>this.sampler.destroy()])try{f()}catch(e){if(!bad){bad=true;primary=e}}this.forget();if(bad)throw primary}
}
