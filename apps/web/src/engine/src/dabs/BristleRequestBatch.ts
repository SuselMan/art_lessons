import {BRISTLE_NATIVE_AA142_VERT,BRISTLE_NATIVE_AA142_FRAG} from './bristleNativeAA142'
import type {PreparedBristleSaturationResource} from './BristleSaturationResource'
import {writeBristleSaturationParameter,type BristleSaturationTable,type BristleSaturationGpuLayout} from '../presets/brushBristleSaturationTable'
import {BRISTLE_SATURATION_GLSL} from './bristleSaturationShader'
import type {BristleInkSpan} from '../presets/brushBristleInkBulk'
import {createBristleInkProfile,type BristleInkSettings,type BristleInkProfile} from '../presets/brushBristleInk'
import {bristleSoakInkFragment139,bristleSoakInkVertex139,bristleInkTextureBytes,BRISTLE_INK_GLSL} from './bristleInkShader'
import type {BehaviorPlaced} from '../presets/brushBehavior'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {createProgram} from '../raster/utils'
const VERT='attribute vec2 a_position;attribute vec2 a_local;attribute vec4 a_color;attribute vec2 a_extent;uniform vec2 u_resolution;varying vec2 v_local;varying vec4 v_color;varying vec2 v_extent;void main(){v_local=a_local;v_color=a_color;v_extent=a_extent;vec2 p=a_position/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,2.*a_color.a-1.,1.);}'
const FRAG='precision highp float;varying vec2 v_local;varying vec4 v_color;varying vec2 v_extent;void main(){float d=length(vec2(max(abs(v_local.x)-v_extent.x,0.),v_local.y))-v_extent.y;if(d>0.)discard;float a=floor(v_color.a*255.+.5)/255.;if(a<=0.)discard;gl_FragColor=vec4(v_color.rgb*a,a);}'
const COPY_VERT='attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=(a_position+1.)*.5;gl_Position=vec4(a_position,0.,1.);}'
const COPY_FRAG='precision highp float;uniform sampler2D u_source;uniform float u_opacity;varying vec2 v_uv;void main(){gl_FragColor=texture2D(u_source,v_uv)*u_opacity;}'
const CORNERS=[[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]] as const
/** Aliased, constant-alpha candidates only. Depth16 ranks all256 U8 alphas:
 * GREATER writes whole RGBA, equal ranks preserve the earlier candidate.
 * No componentwise MAX, feedback sampling, per-hair GL calls or readback.
 * One reusable2WH depth surface; staging<=2048 quads, request<=8192 no-ink hairs (4096 with ink).
 * This does not grant a new descriptor or support fractional AA coverage. */
export class BristleRequestBatch{
 private readonly gl:WebGLRenderingContext
 private readonly data:Float32Array
 private nativeAA142Program?:WebGLProgram
 private program?:WebGLProgram
 private composite?:WebGLProgram
 private inkProgram?:WebGLProgram
 private inkWinnerProgram?:WebGLProgram
 private inkAddComposite?:WebGLProgram
 private inkTexture?:WebGLTexture
 private inkProfile?:BristleInkProfile
 private inkSettings?:BristleInkSettings
 private inkWidth=0
 private inkHeight=0
 private inkData?:Float32Array
 private saturationProgram?:WebGLProgram
 private saturationWinnerProgram?:WebGLProgram
 private saturationResource?:PreparedBristleSaturationResource
 private saturationTexture?:WebGLTexture
 private saturationTable?:BristleSaturationTable
 private saturationLayout?:BristleSaturationGpuLayout
 private saturationParameterScratch?:Float32Array
 private inkSources?:{vertex:string;fragment:(depth:boolean)=>string}
 private saturationSources?:{vertex:string;fragment:(depth:boolean)=>string}
 private soakInkProgram?:WebGLProgram
 private soakInkWinnerProgram?:WebGLProgram
 private soakSaturationProgram?:WebGLProgram
 private soakSaturationWinnerProgram?:WebGLProgram
 private buffer?:WebGLBuffer
 private quad?:WebGLBuffer
 private depth?:WebGLRenderbuffer
 private vaoExtension?:OES_vertex_array_object|null
 private vao?:WebGLVertexArrayObjectOES
 private instancing?:ANGLE_instanced_arrays|null
 private width=0
 private height=0
 private busy=false
 constructor(gl:WebGLRenderingContext,staging=new Float32Array(2048*6*10)){
  if(staging.length!==2048*6*10)throw RangeError('Exact Bristle staging required')
  this.gl=gl;this.data=staging
 }
 get depthBytes():number{return this.width*this.height*2}
 get inkTextureBytes():number{return this.inkWidth*this.inkHeight*4}
 assertInkPrepared(settings:BristleInkSettings,winner:boolean,soak=false):void{if(soak&&!(settings.useSaturation?(winner?this.soakSaturationWinnerProgram:this.soakSaturationProgram):(winner?this.soakInkWinnerProgram:this.soakInkProgram)))throw Error('Bristle Soak variant is not prepared');if(this.inkSettings!==settings||!this.inkProfile||!this.inkTexture||!this.inkProgram||(winner&&!this.inkWinnerProgram)||(settings.useSaturation&&(!this.saturationTable||!this.saturationTexture||!this.saturationProgram||(winner&&!this.saturationWinnerProgram))))throw Error('Bristle ink profile is not prepared');if(settings.useSaturation){if(!this.saturationResource)throw Error('Bristle saturation resource is missing');this.saturationResource.assertCurrent()}}
 /** Context/reset boundary drops the borrowed raw plane before GPU cache teardown. */
 releaseSaturationResource():void {
  const resource=this.saturationResource
  this.saturationResource=undefined;this.saturationTable=undefined;this.saturationTexture=undefined;this.saturationLayout=undefined
  resource?.release()
 }
 preparedInkProfile(settings:BristleInkSettings):BristleInkProfile{this.assertInkPrepared(settings,false);return this.inkProfile!}

 /** Prewarm only. Reject unsupported controls/capabilities before gesture state
  * advances. One painter-owned texture is reused when selecting another curve. */
 prepareInkProfile(settings:BristleInkSettings,winner:boolean,soak=false):void{
  if(this.busy)throw Error('Bristle winner is busy')
  if(!settings.useSaturation){this.releaseSaturationResource()}
  this.installInkProfile(settings,winner)
  if(soak)this.prepareSoakPrograms139(settings,winner)
 }
 private installInkProfile(settings:BristleInkSettings,winner:boolean,prepared?:{profile:BristleInkProfile;packed:{bytes:Uint8Array;width:number;height:number}}):void{
  if(this.busy)throw Error('Bristle winner is busy')
  if(settings.useSaturation)throw Error('Bristle saturation requires compiled resource preparation')
  const gl=this.gl
  if(winner&&!gl.getExtension('EXT_frag_depth'))throw Error('Bristle ink winner requires EXT_frag_depth')
  if(Object.isFrozen(settings)&&Object.isFrozen(settings.depletion)&&this.inkSettings===settings&&this.inkProfile&&this.inkTexture&&this.inkProgram&&(!winner||this.inkWinnerProgram))return
  this.preparePrograms()
  const profile=prepared?.profile??createBristleInkProfile(settings)
  const same=this.inkProfile&&Object.keys(profile).every(key=>key==='depletion'||profile[key as keyof BristleInkProfile]===this.inkProfile![key as keyof BristleInkProfile])&&profile.depletion.every((value,i)=>value===this.inkProfile!.depletion[i])
  if(same&&(!winner||this.inkWinnerProgram)){this.inkSettings=settings;return}
  const vertex=VERT.replace('uniform vec2 u_resolution;','attribute vec4 a_inkState;attribute vec4 a_inkAxis;varying vec4 v_inkState;varying vec4 v_inkAxis;uniform vec2 u_resolution;').replace('v_local=a_local;','v_inkState=a_inkState;v_inkAxis=a_inkAxis;v_local=a_local;')
  const fragment=(depth:boolean)=>`${depth?'#extension GL_EXT_frag_depth : require\n':''}precision highp float;varying vec2 v_local;varying vec4 v_color;varying vec2 v_extent;uniform float u_targetHeight;uniform vec3 u_requestMode;${BRISTLE_INK_GLSL}void main(){float d=length(vec2(max(abs(v_local.x)-v_extent.x,0.),v_local.y))-v_extent.y;if(d>(u_requestMode.x>0.5?0.5:0.0))discard;float a=bristleInkAlpha(vec2(gl_FragCoord.x,u_targetHeight-gl_FragCoord.y))*v_color.a;if(u_requestMode.x>0.5)a*=clamp(0.5-d,0.0,1.0);else a=floor(a*255.0+0.5)/255.0;if(a<=0.)discard;${depth?'gl_FragDepthEXT=a;':''}gl_FragColor=vec4(v_color.rgb*(u_requestMode.y>0.5?1.0:a),a);}`
  this.inkSources={vertex,fragment}
  this.inkProgram??=createProgram(gl,vertex,fragment(false))
  this.inkAddComposite??=createProgram(gl,COPY_VERT,COPY_FRAG.replace('texture2D(u_source,v_uv)*u_opacity','vec4(texture2D(u_source,v_uv).rgb*texture2D(u_source,v_uv).a,texture2D(u_source,v_uv).a)*u_opacity'))
  if(winner)this.inkWinnerProgram??=createProgram(gl,vertex,fragment(true))
  if(!this.vaoExtension)this.assertRestorableAttributes(winner?this.inkWinnerProgram:this.inkProgram)
  const packed=prepared?.packed??bristleInkTextureBytes(profile)
  const active=gl.getParameter(gl.ACTIVE_TEXTURE) as number,texture=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null,alignment=gl.getParameter(gl.UNPACK_ALIGNMENT) as number,flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean,premultiply=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean,color=gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) as number
  let failed=false,primary:unknown
  const restore=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;primary=error}}}
  try{
   this.inkTexture??=gl.createTexture()??undefined
   if(!this.inkTexture)throw Error('Bristle ink texture unavailable')
   gl.bindTexture(gl.TEXTURE_2D,this.inkTexture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE)
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,packed.width,packed.height,0,gl.RGBA,gl.UNSIGNED_BYTE,packed.bytes)
   this.inkData??=new Float32Array(2048*6*18)
   this.inkSettings=settings;this.inkProfile=profile;this.inkWidth=packed.width;this.inkHeight=packed.height
  }catch(error){failed=true;primary=error;this.inkProfile=undefined}
  finally{restore(()=>gl.pixelStorei(gl.UNPACK_ALIGNMENT,alignment));restore(()=>gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,Number(flip)));restore(()=>gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,Number(premultiply)));restore(()=>gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,color));restore(()=>gl.activeTexture(active));restore(()=>gl.bindTexture(gl.TEXTURE_2D,texture))}
  if(failed)throw primary
 }

 /** Compiled93 only: no client compiler, CPU scheduler or per-request upload. */
 prepareCompiledSaturation(settings:BristleInkSettings,resource:PreparedBristleSaturationResource,winner:boolean,soak=false):void {
  if(this.busy){resource.release();throw Error('Bristle winner is busy')}
  let installed=false
  try{
   resource.assertCurrent()
   if(this.inkSettings===settings&&this.inkProfile===resource.profile&&this.saturationResource?.texture===resource.texture&&this.saturationProgram&&(!winner||this.saturationWinnerProgram)){
    if(soak)this.prepareSoakPrograms139(settings,winner)
    this.assertInkPrepared(settings,winner,soak);resource.release();installed=true;return
   }
   this.saturationResource?.release();this.saturationResource=undefined
   this.saturationTable=undefined;this.saturationTexture=undefined;this.saturationLayout=undefined
   const curve=bristleInkTextureBytes(resource.profile)
   this.installSaturation(settings,resource.profile,resource.table,resource.layout,winner,curve)
   resource.assertCurrent();this.saturationResource=resource;this.saturationTexture=resource.texture
   if(soak)this.prepareSoakPrograms139(settings,winner)
   installed=true
  }finally{if(!installed){this.saturationTable=undefined;this.inkProfile=undefined;resource.release()}}
 }
 preparedSaturationTable(settings:BristleInkSettings):BristleSaturationTable{this.assertInkPrepared(settings,false);if(!settings.useSaturation||!this.saturationTable)throw Error('Bristle saturation is not prepared');return this.saturationTable}
 private installSaturation(settings:BristleInkSettings,profile:BristleInkProfile,table:BristleSaturationTable,layout:BristleSaturationGpuLayout,winner:boolean,curve:{bytes:Uint8Array;width:number;height:number}):void{
  const gl=this.gl
  if(winner&&!gl.getExtension('EXT_frag_depth'))throw Error('Bristle ink winner requires EXT_frag_depth')
  if(gl.getParameter(gl.MAX_TEXTURE_SIZE)<1024||gl.getParameter(gl.MAX_VERTEX_ATTRIBS)<7||gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<3)throw Error('Bristle saturation capabilities unavailable')
  // Reuse the exact ordinary opacity preparation, then restore the genuine
  // saturation profile only after the private program and upload succeed.
  this.installInkProfile({...settings,useSaturation:false},winner,{profile:Object.freeze({...profile,useSaturation:false}),packed:curve})
  const vertex=VERT.replace('uniform vec2 u_resolution;','attribute vec4 a_inkState;attribute vec4 a_inkAxis;attribute vec4 a_satParameter;varying vec4 v_inkState;varying vec4 v_inkAxis;varying highp vec4 v_satParameter;uniform vec2 u_resolution;').replace('v_local=a_local;','v_inkState=a_inkState;v_inkAxis=a_inkAxis;v_satParameter=a_satParameter;v_local=a_local;')
  const fragment=(depth:boolean)=>`${depth?'#extension GL_EXT_frag_depth : require\n':''}precision highp float;varying vec2 v_local;varying vec4 v_color;varying vec2 v_extent;uniform float u_targetHeight;uniform vec3 u_requestMode;${BRISTLE_INK_GLSL}${BRISTLE_SATURATION_GLSL}
vec3 satColor(float k){float remaining=1.-bristleCurve(v_inkState.x);float factor=u_inkFlags.y>.5?dot(vec4(v_inkState.w,v_inkState.z,v_inkState.y,remaining),u_inkWeights):v_inkState.w*v_inkState.z*v_inkState.y*remaining;return bristleSaturationColor(v_color.rgb,factor,v_inkState.x,k);}
void main(){float d=length(vec2(max(abs(v_local.x)-v_extent.x,0.),v_local.y))-v_extent.y;if(d>(u_requestMode.x>.5?.5:0.))discard;
vec2 pixel=vec2(gl_FragCoord.x,u_targetHeight-gl_FragCoord.y);float coordinate=mix(pixel.x,pixel.y,v_inkAxis.z);float k=clamp(floor((coordinate-v_inkAxis.x)*v_inkAxis.y+.5),0.,v_inkAxis.w-1.);
float a=bristleInkAt(k)*v_color.a;if(u_requestMode.x<.5)a=floor(a*255.+.5)/255.;vec3 rgb=satColor(k);
if(u_requestMode.x<.5&&k>=v_inkAxis.w-2.&&k<v_inkAxis.w-1.){float b=floor(bristleInkAt(v_inkAxis.w-1.)*v_color.a*255.+.5)/255.;vec3 next=satColor(v_inkAxis.w-1.);if(u_requestMode.z>.5){float total=b+a*(1.-b);rgb=total>0.?(next*b+rgb*a*(1.-b))/total:rgb;a=total;}else if(b>a){a=b;rgb=next;}}
if(u_requestMode.x>.5)a*=clamp(.5-d,0.,1.);else a=floor(a*255.+.5)/255.;if(a<=0.)discard;${depth?'gl_FragDepthEXT=a;':''}gl_FragColor=vec4(rgb*(u_requestMode.y>.5?1.:a),a);}`
  this.saturationSources={vertex,fragment}
  this.saturationProgram??=createProgram(gl,vertex,fragment(false))
  if(winner)this.saturationWinnerProgram??=createProgram(gl,vertex,fragment(true))
  if(!this.vaoExtension)this.assertRestorableAttributes(winner?this.saturationWinnerProgram:this.saturationProgram)
  this.inkData??=new Float32Array(2048*6*22)
  if(this.inkData.length<2048*6*22)this.inkData=new Float32Array(2048*6*22)
  this.saturationParameterScratch??=new Float32Array(4)
  this.saturationLayout=layout;this.saturationTable=table
  this.inkProfile=profile;this.inkSettings=settings
 }

 private prepareSoakPrograms139(settings:BristleInkSettings,winner:boolean):void {
  const gl=this.gl,source=settings.useSaturation?this.saturationSources:this.inkSources
  if(!source||gl.getParameter(gl.MAX_VERTEX_ATTRIBS)<(settings.useSaturation?8:7))throw Error('Bristle Soak attributes unavailable')
  const vertex=bristleSoakInkVertex139(source.vertex),fragment=(depth:boolean)=>bristleSoakInkFragment139(source.fragment(depth))
  if(settings.useSaturation){this.soakSaturationProgram??=createProgram(gl,vertex,fragment(false));if(winner)this.soakSaturationWinnerProgram??=createProgram(gl,vertex,fragment(true))}
  else{this.soakInkProgram??=createProgram(gl,vertex,fragment(false));if(winner)this.soakInkWinnerProgram??=createProgram(gl,vertex,fragment(true))}
  if(!this.vaoExtension)throw Error('Bristle Soak requires its prepared private VAO')
  if(!this.inkData||this.inkData.length<2048*6*23)this.inkData=new Float32Array(2048*6*23)
 }
 prepare(width:number,height:number):void{this.preparePrograms();this.prepareDimensions(width,height)}
 prepareNativeAA142():void{
  this.preparePrograms()
  this.nativeAA142Program??=createProgram(this.gl,BRISTLE_NATIVE_AA142_VERT,BRISTLE_NATIVE_AA142_FRAG)
  if(!this.vaoExtension)this.assertRestorableAttributes(this.nativeAA142Program)
 }
 preparePrograms():void{
  if(this.busy)throw Error('Bristle winner is busy')
  if(this.program&&this.composite&&this.buffer&&this.quad&&(this.vaoExtension===null||this.vao))return
  const gl=this.gl,oldBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer|null
  let failed=false,primary:unknown
  try{
   this.program??=createProgram(gl,VERT,FRAG);this.composite??=createProgram(gl,COPY_VERT,COPY_FRAG)
   if(this.vaoExtension===undefined){this.vaoExtension=gl.getExtension('OES_vertex_array_object');this.instancing=gl.getExtension('ANGLE_instanced_arrays')}
   if(this.vaoExtension){this.vao??=this.vaoExtension.createVertexArrayOES()??undefined;if(!this.vao)throw Error('Bristle private VAO unavailable')}
   else this.assertRestorableAttributes()
   this.buffer??=gl.createBuffer()??undefined
   if(!this.quad){this.quad=gl.createBuffer()??undefined;gl.bindBuffer(gl.ARRAY_BUFFER,this.quad??null);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)}
   if(!this.buffer||!this.quad)throw Error('Bristle allocation failed')
  }catch(error){failed=true;primary=error}
  finally{try{gl.bindBuffer(gl.ARRAY_BUFFER,oldBuffer)}catch(error){if(!failed){failed=true;primary=error}}}
  if(failed)throw primary
 }
 /** Only target-sized storage may be prepared at first tile resolution.
  * Shader/VAO construction must already have succeeded during prewarm. */
 prepareDimensions(width:number,height:number,nativeAA142=false):void{
  if(nativeAA142){
   if(this.busy||!this.nativeAA142Program)throw Error('Native AA142 is not prepared')
   const max=this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE)as number
   if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>max||height>max)throw RangeError('Invalid Bristle dimensions')
   return // OVER needs the existing colour request only, no depth surface.
  }
  if(this.busy)throw Error('Bristle winner is busy')
  if(!this.program||!this.composite||!this.buffer||!this.quad)throw Error('Bristle programs are not prepared')
  if(this.depth&&width===this.width&&height===this.height)return
  const gl=this.gl,max=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>max||height>max)throw RangeError('Invalid Bristle dimensions')
  const previous=gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer|null
  let failed=false,primary:unknown
  try{
   this.depth??=gl.createRenderbuffer()??undefined
   if(!this.depth)throw Error('Bristle allocation failed')
   gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);this.width=width;this.height=height
  }catch(error){failed=true;primary=error}
  finally{try{gl.bindRenderbuffer(gl.RENDERBUFFER,previous)}catch(error){if(!failed){failed=true;primary=error}}}
  if(failed)throw primary
 }
 private assertRestorableAttributes(program=this.program):void{
  const gl=this.gl
  for(const loc of [...new Set(['a_position','a_local','a_color','a_extent',...(program===this.program?[]:['a_inkState','a_inkAxis',...(program===this.saturationProgram||program===this.saturationWinnerProgram?['a_satParameter']:[])])].map(name=>gl.getAttribLocation(program!,name)).concat(gl.getAttribLocation(this.composite!,'a_position')))])
   if(loc>=0&&!gl.getVertexAttrib(loc,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING))throw Error('Bristle winner requires private VAO or restorable attribute buffers')
 }
 reset():void{
  if(this.busy)throw Error('Bristle winner is busy')
  const gl=this.gl
  let failed=false,primary:unknown
  for(const fn of [()=>{if(this.nativeAA142Program)gl.deleteProgram(this.nativeAA142Program)},()=>{if(this.soakInkProgram)gl.deleteProgram(this.soakInkProgram)},()=>{if(this.soakInkWinnerProgram)gl.deleteProgram(this.soakInkWinnerProgram)},()=>{if(this.soakSaturationProgram)gl.deleteProgram(this.soakSaturationProgram)},()=>{if(this.soakSaturationWinnerProgram)gl.deleteProgram(this.soakSaturationWinnerProgram)},()=>{if(this.saturationProgram)gl.deleteProgram(this.saturationProgram)},()=>{if(this.saturationWinnerProgram)gl.deleteProgram(this.saturationWinnerProgram)},()=>{this.saturationResource?.release()},()=>{if(this.inkProgram)gl.deleteProgram(this.inkProgram)},()=>{if(this.inkAddComposite)gl.deleteProgram(this.inkAddComposite)},()=>{if(this.inkWinnerProgram)gl.deleteProgram(this.inkWinnerProgram)},()=>{if(this.inkTexture)gl.deleteTexture(this.inkTexture)},()=>{if(this.program)gl.deleteProgram(this.program)},()=>{if(this.composite)gl.deleteProgram(this.composite)},()=>{if(this.buffer)gl.deleteBuffer(this.buffer)},()=>{if(this.quad)gl.deleteBuffer(this.quad)},()=>{if(this.depth)gl.deleteRenderbuffer(this.depth)},()=>{if(this.vao)this.vaoExtension?.deleteVertexArrayOES(this.vao)}])try{fn()}catch(error){if(!failed){failed=true;primary=error}}
  this.inkSources=undefined;this.saturationSources=undefined;this.soakInkProgram=undefined;this.soakInkWinnerProgram=undefined;this.soakSaturationProgram=undefined;this.soakSaturationWinnerProgram=undefined;
  this.saturationProgram=undefined;this.saturationWinnerProgram=undefined;this.saturationTexture=undefined;this.saturationTable=undefined;this.saturationLayout=undefined;this.saturationResource=undefined;this.saturationParameterScratch=undefined;
  this.inkAddComposite=undefined;this.inkProgram=undefined;this.inkWinnerProgram=undefined;this.inkTexture=undefined;this.inkProfile=undefined;this.inkSettings=undefined;this.inkWidth=0;this.inkHeight=0;this.inkData=undefined
  this.nativeAA142Program=undefined;this.program=undefined;this.composite=undefined;this.buffer=undefined;this.quad=undefined;this.depth=undefined;this.width=0;this.height=0;this.vao=undefined;this.vaoExtension=undefined;this.instancing=undefined
  if(failed)throw primary
 }
 destroy():void{this.reset()}
 paint(stamps:readonly BehaviorPlaced[],coverage:AccumulationBuffer,request:AccumulationBuffer,originX:number,originY:number,ink?:{antialias:boolean;compositing:boolean},nativeAA142=false):void{
  if(this.busy)throw Error('Bristle winner is busy')
  const gl=this.gl,w=coverage.width,h=coverage.height,saturation=!!ink&&!!this.inkProfile?.useSaturation
  const composite=ink&&ink.antialias&&!ink.compositing?this.inkAddComposite:this.composite
  const soak=!!ink&&stamps.some(s=>(s as BehaviorPlaced&{bristleInkSpan?:BristleInkSpan}).bristleInkSpan?.sampleAlpha!==undefined)
  if(nativeAA142&&ink)throw Error('Native AA142 is no-ink only')
  if(nativeAA142&&!this.nativeAA142Program)throw Error('Native AA142 is not prewarmed')
  if(nativeAA142)for(const s of stamps){const line=(s as BehaviorPlaced&{bristleTrajectory142?:{start:readonly[number,number];end:readonly[number,number]}}).bristleTrajectory142;if(!line||![...line.start,...line.end].every(Number.isFinite))throw Error('Missing native AA142 trajectory')}
  const winner=!nativeAA142&&(!ink||(!ink.antialias&&!ink.compositing)),program=nativeAA142?this.nativeAA142Program:ink?(soak?(saturation?(winner?this.soakSaturationWinnerProgram:this.soakSaturationProgram):(winner?this.soakInkWinnerProgram:this.soakInkProgram)):(saturation?(winner?this.saturationWinnerProgram:this.saturationProgram):(winner?this.inkWinnerProgram:this.inkProgram))):this.program,data=ink?this.inkData:this.data,stride=ink?(saturation?22:18)+(soak?1:0):10
  if(ink&&(!program||!data||!this.inkProfile||!this.inkTexture))throw Error('Bristle ink is not prewarmed')
  if(ink)for(const stamp of stamps){const span=(stamp as BehaviorPlaced&{bristleInkSpan?:BristleInkSpan}).bristleInkSpan;if(!span||soak&&(span.sampleAlpha===undefined||!Number.isFinite(span.sampleAlpha)||span.sampleAlpha<0||span.sampleAlpha>1)||!Number.isSafeInteger(span.counter)||span.counter<0||!Number.isSafeInteger(span.samples)||span.samples<1||!Number.isSafeInteger(span.steps)||span.steps<0||(span.axis!=='x'&&span.axis!=='y')||![span.initialInk,span.length].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Number.isFinite(span.pressure)||span.pressure<0||span.pressure>2||![...span.start,...span.end].every(Number.isFinite))throw Error('Missing or invalid Bristle ink span')}
  if(!this.program||!composite||!this.buffer||!this.quad||(!nativeAA142&&(!this.depth||w!==this.width||h!==this.height))||request.width!==w||request.height!==h||request.texture===coverage.texture||request.fbo===coverage.fbo)throw Error('Bristle winner not prepared for distinct request/coverage')
  if(!Number.isFinite(originX)||!Number.isFinite(originY))throw RangeError('Invalid Bristle origin')
  if(nativeAA142)this.prepareDimensions(w,h,true)
  const populationLimit=ink?4096:8192
  if(stamps.length>populationLimit*4)throw RangeError('Bristle batch exceeds four requests')
  for(const s of stamps)if(![s.x,s.y,s.radius,s.angle,s.segmentLength??0,s.flow,s.ceiling,...s.color].every(Number.isFinite)||s.radius<0||(s.segmentLength??0)<0||s.flow<0||s.flow>1||s.ceiling<0||s.ceiling>1||s.color.some(v=>v<0||v>1))throw RangeError('Invalid aliased Bristle candidate')
  let groups=0
  for(let first=0;first<stamps.length;){if(++groups>4)throw RangeError('Bristle batch exceeds four requests');let end=first+1;while(end<stamps.length&&stamps[end].group===stamps[first].group)end++;if(end-first>populationLimit)throw RangeError('Bristle request exceeds'+populationLimit+' hairs');first=end}
  if(!stamps.length)return
  if(!this.vaoExtension)this.assertRestorableAttributes(program)
  this.busy=true
  let restore:(()=>void)|undefined,attached=false,failed=false,primary:unknown
  const attempt=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;primary=error}}}
  try{
   const caps=[gl.BLEND,gl.CULL_FACE,gl.DEPTH_TEST,gl.SCISSOR_TEST,gl.STENCIL_TEST,gl.DITHER,gl.POLYGON_OFFSET_FILL,gl.SAMPLE_ALPHA_TO_COVERAGE,gl.SAMPLE_COVERAGE]
   const enabled=caps.map(cap=>gl.isEnabled(cap))
   const fbo=gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer|null,rb=gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer|null,buf=gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer|null,prog=gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram|null
   const viewport=gl.getParameter(gl.VIEWPORT) as Int32Array,mask=gl.getParameter(gl.COLOR_WRITEMASK) as boolean[],clear=gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array
   const depthFunc=gl.getParameter(gl.DEPTH_FUNC) as number,depthMask=gl.getParameter(gl.DEPTH_WRITEMASK) as boolean,range=gl.getParameter(gl.DEPTH_RANGE) as Float32Array,depthClear=gl.getParameter(gl.DEPTH_CLEAR_VALUE) as number
   const eqRgb=gl.getParameter(gl.BLEND_EQUATION_RGB) as number,eqAlpha=gl.getParameter(gl.BLEND_EQUATION_ALPHA) as number,srcRgb=gl.getParameter(gl.BLEND_SRC_RGB) as number,dstRgb=gl.getParameter(gl.BLEND_DST_RGB) as number,srcAlpha=gl.getParameter(gl.BLEND_SRC_ALPHA) as number,dstAlpha=gl.getParameter(gl.BLEND_DST_ALPHA) as number
   const unit=gl.getParameter(gl.ACTIVE_TEXTURE) as number,texture=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null
   let texture0=texture,texture0Known=unit===gl.TEXTURE0
   let texture1:WebGLTexture|null=null,texture1Known=false,texture2:WebGLTexture|null=null,texture2Known=false
   const locations=[...new Set((ink?['a_position','a_local','a_color','a_extent','a_inkState','a_inkAxis',...(saturation?['a_satParameter']:[]),...(soak?['a_soakAlpha']:[])]:['a_position','a_local','a_color','a_extent']).map(name=>gl.getAttribLocation(program!,name)).concat(gl.getAttribLocation(composite,'a_position')))].filter(loc=>loc>=0)
   const ambientVao=this.vaoExtension?gl.getParameter(this.vaoExtension.VERTEX_ARRAY_BINDING_OES) as WebGLVertexArrayObjectOES|null:null
   const attribs=this.vaoExtension?[]:locations.map(loc=>({loc,enabled:gl.getVertexAttrib(loc,gl.VERTEX_ATTRIB_ARRAY_ENABLED) as boolean,buffer:gl.getVertexAttrib(loc,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) as WebGLBuffer|null,size:gl.getVertexAttrib(loc,gl.VERTEX_ATTRIB_ARRAY_SIZE) as number,type:gl.getVertexAttrib(loc,gl.VERTEX_ATTRIB_ARRAY_TYPE) as number,normalized:gl.getVertexAttrib(loc,gl.VERTEX_ATTRIB_ARRAY_NORMALIZED) as boolean,stride:gl.getVertexAttrib(loc,gl.VERTEX_ATTRIB_ARRAY_STRIDE) as number,offset:gl.getVertexAttribOffset(loc,gl.VERTEX_ATTRIB_ARRAY_POINTER),divisor:this.instancing?gl.getVertexAttrib(loc,this.instancing.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE) as number:0}))
   restore=()=>{
    if(attached)attempt(()=>{gl.bindFramebuffer(gl.FRAMEBUFFER,request.fbo);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,null)})
    if(this.vaoExtension)attempt(()=>this.vaoExtension!.bindVertexArrayOES(ambientVao))
    for(const a of attribs)attempt(()=>{if(a.buffer){gl.bindBuffer(gl.ARRAY_BUFFER,a.buffer);gl.vertexAttribPointer(a.loc,a.size,a.type,a.normalized,a.stride,a.offset)}if(a.enabled)gl.enableVertexAttribArray(a.loc);else gl.disableVertexAttribArray(a.loc);this.instancing?.vertexAttribDivisorANGLE(a.loc,a.divisor)})
    attempt(()=>gl.bindBuffer(gl.ARRAY_BUFFER,buf));attempt(()=>gl.useProgram(prog));attempt(()=>gl.activeTexture(gl.TEXTURE0));if(texture0Known)attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture0));if(texture1Known){attempt(()=>gl.activeTexture(gl.TEXTURE1));attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture1))}if(texture2Known){attempt(()=>gl.activeTexture(gl.TEXTURE2));attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture2))}attempt(()=>gl.activeTexture(unit));if(unit!==gl.TEXTURE0)attempt(()=>gl.bindTexture(gl.TEXTURE_2D,texture))
    attempt(()=>gl.depthFunc(depthFunc));attempt(()=>gl.depthMask(depthMask));attempt(()=>gl.depthRange(range[0],range[1]));attempt(()=>gl.clearDepth(depthClear));attempt(()=>gl.colorMask(mask[0],mask[1],mask[2],mask[3]));attempt(()=>gl.clearColor(clear[0],clear[1],clear[2],clear[3]))
    attempt(()=>gl.blendEquationSeparate(eqRgb,eqAlpha));attempt(()=>gl.blendFuncSeparate(srcRgb,dstRgb,srcAlpha,dstAlpha))
    caps.forEach((cap,i)=>attempt(()=>{if(enabled[i])gl.enable(cap);else gl.disable(cap)}));attempt(()=>gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]));attempt(()=>gl.bindRenderbuffer(gl.RENDERBUFFER,rb));attempt(()=>gl.bindFramebuffer(gl.FRAMEBUFFER,fbo))
   }
   if(this.vaoExtension)this.vaoExtension.bindVertexArrayOES(this.vao!)
   gl.activeTexture(gl.TEXTURE0);texture0=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null;texture0Known=true
   if(ink){gl.activeTexture(gl.TEXTURE1);texture1=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null;texture1Known=true;gl.bindTexture(gl.TEXTURE_2D,this.inkTexture!);gl.activeTexture(gl.TEXTURE0)}
   if(saturation){gl.activeTexture(gl.TEXTURE2);texture2=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null;texture2Known=true;gl.bindTexture(gl.TEXTURE_2D,this.saturationTexture!);gl.activeTexture(gl.TEXTURE0)}
   gl.bindFramebuffer(gl.FRAMEBUFFER,request.fbo)
   if(gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)!==gl.NONE||gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,gl.STENCIL_ATTACHMENT,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)!==gl.NONE)throw Error('Foreign Bristle depth/stencil attachment')
   if(!nativeAA142){attached=true;gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.depth!)}
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Bristle framebuffer unavailable')
   for(const cap of caps)gl.disable(cap)
   gl.colorMask(true,true,true,true);gl.depthMask(true);gl.depthRange(0,1);gl.depthFunc(gl.GREATER);gl.clearDepth(0);gl.clearColor(0,0,0,0)
   for(let first=0;first<stamps.length;){
    let end=first+1;while(end<stamps.length&&stamps[end].group===stamps[first].group)end++
    if(saturation){
     this.saturationResource!.assertCurrent()
     const layout=this.saturationLayout!;gl.useProgram(program!);gl.uniform1i(gl.getUniformLocation(program!,'u_saturation'),2);gl.uniform4f(gl.getUniformLocation(program!,'u_satTree'),layout.base,layout.segments,layout.tailStart,126);gl.uniform2f(gl.getUniformLocation(program!,'u_satTail'),layout.tailQ,Number(layout.multiplicative))
    }
    request.beginReplaceDraw();gl.clear(gl.COLOR_BUFFER_BIT|(nativeAA142?0:gl.DEPTH_BUFFER_BIT));if(winner){gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND)}else{gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);if(nativeAA142||ink!.compositing)gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);else gl.blendFuncSeparate(gl.ONE,gl.ZERO,gl.ONE,gl.ONE)}gl.useProgram(program!);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer)
    gl.uniform2f(gl.getUniformLocation(program!,'u_resolution'),w,h)
    if(nativeAA142)gl.uniform2f(gl.getUniformLocation(program!,'u_worldOrigin'),originX,originY)
    if(ink){const p=this.inkProfile!;gl.uniform1i(gl.getUniformLocation(program!,'u_inkCurve'),1);gl.uniform3f(gl.getUniformLocation(program!,'u_inkTable'),this.inkWidth,this.inkHeight,p.amount);gl.uniform4f(gl.getUniformLocation(program!,'u_inkWeights'),p.pressureWeight,p.bristleLengthWeight,p.bristleInkAmountWeight,p.inkDepletionWeight);gl.uniform2f(gl.getUniformLocation(program!,'u_inkFlags'),Number(p.useOpacity),Number(p.useWeights));gl.uniform1f(gl.getUniformLocation(program!,'u_targetHeight'),h);gl.uniform3f(gl.getUniformLocation(program!,'u_requestMode'),Number(ink.antialias),Number(!ink.compositing&&!winner),Number(ink.compositing))}
    const attributes:readonly(readonly[string,number,number])[]=ink?[['a_position',2,0],['a_local',2,2],['a_color',4,4],['a_extent',2,8],['a_inkState',4,10],['a_inkAxis',4,14],...(saturation?[['a_satParameter',4,18] as const]:[]),...(soak?[['a_soakAlpha',1,saturation?22:18] as const]:[])]:[['a_position',2,0],['a_local',2,2],['a_color',4,4],['a_extent',2,8]]
    for(const [name,size,offset]of attributes){const loc=gl.getAttribLocation(program!,name);if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride*4,offset*4);this.instancing?.vertexAttribDivisorANGLE(loc,0)}}
    let vertices=0
    const flush=()=>{if(vertices){gl.bufferData(gl.ARRAY_BUFFER,data!.subarray(0,vertices*stride),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices);vertices=0}}
    for(let i=first;i<end;i++){
     if(nativeAA142){
      const s=stamps[i],line=(s as BehaviorPlaced&{bristleTrajectory142:{start:readonly[number,number];end:readonly[number,number]}}).bristleTrajectory142,sx=line.start[0]-originX,sy=line.start[1]-originY,ex=line.end[0]-originX,ey=line.end[1]-originY,minX=Math.min(sx,ex)-3,maxX=Math.max(sx,ex)+3,minY=Math.min(sy,ey)-3,maxY=Math.max(sy,ey)+3
      if(maxX<0||maxY<0||minX>w||minY>h)continue
      if(vertices===2048*6)flush()
      for(const[a,b]of CORNERS){const at=vertices++*stride;data![at]=a<0?minX:maxX;data![at+1]=b<0?minY:maxY;data![at+2]=sx;data![at+3]=sy;data![at+4]=s.color[0];data![at+5]=s.color[1];data![at+6]=s.color[2];data![at+7]=Math.round(s.flow*255)/255;data![at+8]=ex;data![at+9]=ey}
      continue
     }
     const s=stamps[i],length=(s.segmentLength??0)*.5,width=s.radius,cx=s.x-originX,cy=s.y-originY,rx=length+width+1,ry=width+1
     if(cx+rx+ry<0||cy+rx+ry<0||cx-rx-ry>w||cy-rx-ry>h)continue
     if(vertices===2048*6)flush()
     const c=Math.cos(s.angle),sn=Math.sin(s.angle),alpha=Math.round(s.flow*255)/255
     if(saturation){const span=(s as BehaviorPlaced&{bristleInkSpan:BristleInkSpan}).bristleInkSpan;writeBristleSaturationParameter(this.saturationTable!,span.pressure,span.length,this.saturationParameterScratch!,0)}
     for(const [a,b]of CORNERS){const at=vertices++*stride;data![at]=cx+a*rx*c-b*ry*sn;data![at+1]=cy+a*rx*sn+b*ry*c;data![at+2]=a*rx;data![at+3]=b*ry;data![at+4]=s.color[0];data![at+5]=s.color[1];data![at+6]=s.color[2];data![at+7]=alpha;data![at+8]=length;data![at+9]=width
      if(ink){const span=(s as BehaviorPlaced&{bristleInkSpan:BristleInkSpan}).bristleInkSpan,axis=span.axis==='x'?0:1,delta=span.end[axis]-span.start[axis];data![at+10]=Math.min(span.counter,this.inkProfile!.amount);data![at+11]=span.initialInk;data![at+12]=span.length;data![at+13]=span.pressure;data![at+14]=span.start[axis]-(axis===0?originX:originY);data![at+15]=delta<0?-1:1;data![at+16]=axis;data![at+17]=span.samples;if(soak)data![at+(saturation?22:18)]=span.sampleAlpha!;if(saturation){for(let j=0;j<4;j++)data![at+18+j]=this.saturationParameterScratch![j]}}
     }
    }
    flush();request.endDraw();gl.disable(gl.DEPTH_TEST)
    coverage.beginDraw();gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(composite);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,request.texture)
    gl.uniform1i(gl.getUniformLocation(composite,'u_source'),0);gl.uniform1f(gl.getUniformLocation(composite,'u_opacity'),stamps[first].ceiling);gl.bindBuffer(gl.ARRAY_BUFFER,this.quad)
    const pos=gl.getAttribLocation(composite,'a_position');if(pos>=0){gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);this.instancing?.vertexAttribDivisorANGLE(pos,0)}gl.drawArrays(gl.TRIANGLES,0,6);coverage.endDraw();first=end
   }
  }catch(error){failed=true;primary=error}
  finally{try{restore?.()}finally{this.busy=false}}
  if(failed)throw primary
 }
}
