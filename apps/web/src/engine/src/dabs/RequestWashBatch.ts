import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{createProgram}from'../raster/utils'
const uniformNames=['u_source','u_previous','u_resolution','u_sourceSize','u_extent','u_opacity','u_average','u_flatColor','u_previousRegion']as const
type UniformName=typeof uniformNames[number]
/** One BBP-owned kernel. Consumers borrow it; no texture or scratch owner here. */
export class RequestWashBatch{
 private program?:WebGLProgram
 private buffer?:WebGLBuffer
 private locations?:{position:number;uniforms:Record<UniformName,WebGLUniformLocation|null>}
 private epoch={}
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 reset():void{this.epoch={};this.program=undefined;this.buffer=undefined;this.locations=undefined}
 destroy():void{if(this.program)this.gl.deleteProgram(this.program);if(this.buffer)this.gl.deleteBuffer(this.buffer);this.reset()}
 prepare():void{this.program??=createProgram(this.gl,`attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`,`precision highp float;varying vec2 v_uv;uniform sampler2D u_source;uniform sampler2D u_previous;uniform vec2 u_resolution;uniform vec2 u_sourceSize;uniform vec2 u_extent;uniform float u_opacity;uniform float u_average;uniform vec4 u_flatColor;uniform float u_previousRegion;
void main(){vec2 uv=vec2(v_uv.x*u_extent.x/u_sourceSize.x,1.-u_extent.y/u_sourceSize.y+v_uv.y*u_extent.y/u_sourceSize.y);vec4 request=texture2D(u_source,uv),previous=texture2D(u_previous,u_previousRegion>.5?uv:gl_FragCoord.xy/u_resolution);float M=clamp(request.a,0.,1.),O=clamp(u_opacity,0.,1.),A=u_average,D=previous.a,T=M*O;float H=A>O?(A>D?T+(A-T)*D/max(A,.0000001):D):(O>D?D+(O-D)*M:D);vec3 pigment=u_flatColor.a>.5?u_flatColor.rgb:(M>0.?request.rgb/M:vec3(0.));vec3 C=D>0.?mix(previous.rgb/D,pigment,T):pigment;gl_FragColor=vec4(C*H,H);}`);if(!this.locations){const program=this.program;this.locations={position:this.gl.getAttribLocation(program,'a_position'),uniforms:Object.fromEntries(uniformNames.map(name=>[name,this.gl.getUniformLocation(program,name)]))as Record<UniformName,WebGLUniformLocation|null>}}if(!this.buffer){const gl=this.gl;const buffer=gl.createBuffer();if(!buffer)throw Error('Request Wash buffer allocation failed');this.buffer=buffer;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)}}
 assertPrepared():void{if(!this.program||!this.buffer||!this.locations)throw Error('Request Wash program was not prepared')}
 captureCurrent():()=>void{this.assertPrepared();const epoch=this.epoch;return()=>{if(epoch!==this.epoch)throw Error('Request Wash GL generation changed');this.assertPrepared()}}
 transfer(source:AccumulationBuffer,previous:AccumulationBuffer,target:AccumulationBuffer,region:{x:number;y:number;width:number;height:number},opacity:number,average:number,pigment?:readonly[number,number,number],previousRegion=false):void{
  this.assertPrepared()
  if(source.texture===target.texture||previous.texture===target.texture||source.texture===previous.texture)throw Error('Spray Wash transfer aliases coverage')
  if(previousRegion&&(previous.width!==source.width||previous.height!==source.height))throw Error('Request Wash previous patch dimensions differ')
  const gl=this.gl,p=this.program!,{position:loc,uniforms:u}=this.locations!,bottom=target.height-region.y-region.height
  if(region.width<1||region.height<1||region.width>source.width||region.height>source.height)throw RangeError('Spray Wash region exceeds its lease')
  target.beginReplaceDraw()
  try{gl.viewport(region.x,bottom,region.width,region.height);gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer!);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0)
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);gl.uniform1i(u.u_source,0)
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,previous.texture);gl.uniform1i(u.u_previous,1)
   gl.uniform2f(u.u_resolution,target.width,target.height);gl.uniform2f(u.u_sourceSize,source.width,source.height);gl.uniform2f(u.u_extent,region.width,region.height);gl.uniform1f(u.u_previousRegion,previousRegion?1:0);gl.uniform1f(u.u_opacity,opacity);gl.uniform1f(u.u_average,average);if(pigment)gl.uniform4f(u.u_flatColor,pigment[0],pigment[1],pigment[2],1);else gl.uniform4f(u.u_flatColor,0,0,0,0);gl.drawArrays(gl.TRIANGLES,0,6)
  }finally{gl.disableVertexAttribArray(loc);target.endDraw()}
 }
}
