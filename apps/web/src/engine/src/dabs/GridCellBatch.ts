import type{GridCell}from'../presets/brushGrid'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{createProgram}from'../raster/utils'
const VERT=`attribute vec2 a_position;attribute vec4 a_local;attribute vec3 a_sample;attribute vec3 a_hsv;uniform vec2 u_resolution;varying vec4 v_local;varying vec3 v_sample;varying vec3 v_hsv;void main(){v_hsv=a_hsv;v_local=a_local;v_sample=a_sample;vec2 p=a_position/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision highp float;varying vec4 v_local;varying vec3 v_sample;varying vec3 v_hsv;uniform sampler2D u_source;uniform vec4 u_color;uniform vec4 u_style;uniform vec4 u_background;uniform vec2 u_mix;
vec3 adjustHsv(vec3 c,vec3 adj){float v=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),ch=v-lo;float vv=clamp(adj.z>=0.?v+adj.z*(1.-v):v*(1.+adj.z),0.,1.);if(ch<=.000000001||v<=.000000001)return vec3(vv);float h=v==c.r?mod((c.g-c.b)/ch,6.):v==c.g?(c.b-c.r)/ch+2.:(c.r-c.g)/ch+4.;h=mod(h+adj.x*3.+12.,6.);float sc=adj.y>0.?1.+adj.y+2.*adj.y*adj.y:1.+adj.y;float cc=min(vv,min(1.,ch*sc)*(1.-abs(adj.z))),xx=cc*(1.-abs(mod(h,2.)-1.));vec3 q=h<1.?vec3(cc,xx,0.):h<2.?vec3(xx,cc,0.):h<3.?vec3(0.,cc,xx):h<4.?vec3(0.,xx,cc):h<5.?vec3(xx,0.,cc):vec3(cc,0.,xx);return q+vec3(vv-cc);}
void main(){vec2 p=v_local.xy,h=max(v_local.zw,vec2(.0001));float a=1.;
if(u_style.x<.5)a=clamp(.5+(1.-length(p/h))*min(h.x,h.y),0.,1.);
else if(u_style.x<1.5)a=step(abs(p.x),h.x)*step(abs(p.y),h.y);
else{vec2 start=vec2(h.x,-h.y),delta=vec2(-2.*h.x,2.*h.y);float t=clamp(dot(p-start,delta)/max(dot(delta,delta),.0001),0.,1.),radius=u_style.x>3.5?(1.+9.*t)*.5:.5;float d=length(p-start-t*delta);a=u_style.x<2.5?step(d,radius):clamp(.5+radius-d,0.,1.);}
if(a<=0.)discard;vec4 color=u_style.y>.5?texture2D(u_source,v_sample.xy):u_color;if(u_mix.x>=0.){float wa=floor(u_mix.x*255.),wb=floor((1.-u_mix.x)*255.);vec4 straight=vec4(color.rgb/max(color.a,.00392157),color.a);float sum=straight.a*wa+u_background.a*wb;color=sum>0.?vec4((straight.rgb*straight.a*wa+u_background.rgb*u_background.a*wb)/sum,floor(sum+.5)/255.):vec4(0.);color.rgb=floor(color.rgb*255.+.5)/255.;color.rgb*=color.a;}
if(any(notEqual(v_hsv,vec3(0.)))){vec3 adjusted=adjustHsv(color.rgb/max(color.a,.00392157),v_hsv);color.rgb=adjusted*color.a;}if(u_style.w>.5)color=vec4(color.rgb/max(color.a,.00392157),1.);gl_FragColor=color*(a*v_sample.z*u_style.z);}`
const CORNERS=[[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]]as const
/** Bounded ordered cell batch; source is gathered once before any write. */
export class GridCellBatch{
 private program?:WebGLProgram
 private transferProgram?:WebGLProgram
 private buffer?:WebGLBuffer
 private data=new Float32Array(1024*6*12)
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 reset():void{this.program=undefined;this.transferProgram=undefined;this.buffer=undefined}
 destroy():void{if(this.transferProgram)this.gl.deleteProgram(this.transferProgram);if(this.program)this.gl.deleteProgram(this.program);if(this.buffer)this.gl.deleteBuffer(this.buffer);this.reset()}
 assertPrepared():void{if(!this.program||!this.buffer)throw Error('Grid cells were not prepared')}
 prepare():void{this.program??=createProgram(this.gl,VERT,FRAG);this.buffer??=this.gl.createBuffer()!}
 paint(cells:readonly GridCell[],target:AccumulationBuffer,originX:number,originY:number,source:AccumulationBuffer,rect:{minX:number;minY:number},span:number,color:readonly number[],shape:number,sample:boolean,randomOpacity:boolean,opacity:number,background:readonly number[]=[0,0,0,0],mixPressure=-1,replace=false,prepared=false):void{
  if(prepared)this.assertPrepared();else this.prepare();const gl=this.gl,p=this.program!;target.beginDraw();if(replace)gl.disable(gl.BLEND);gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer!);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);gl.uniform1i(gl.getUniformLocation(p,'u_source'),0);gl.uniform2f(gl.getUniformLocation(p,'u_resolution'),target.width,target.height);gl.uniform4f(gl.getUniformLocation(p,'u_color'),color[0]*(color[3]??1),color[1]*(color[3]??1),color[2]*(color[3]??1),color[3]??1);gl.uniform4f(gl.getUniformLocation(p,'u_style'),shape,sample?1:0,opacity,randomOpacity?1:0);gl.uniform4f(gl.getUniformLocation(p,'u_background'),background[0],background[1],background[2],background[3]);gl.uniform2f(gl.getUniformLocation(p,'u_mix'),mixPressure,0)
  const attributes=[['a_position',2,0],['a_local',4,2],['a_sample',3,6],['a_hsv',3,9]]as const,locations=attributes.map(([name,size,offset])=>{const loc=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,48,offset*4);return loc});let vertices=0
  const flush=()=>{if(vertices){gl.bufferData(gl.ARRAY_BUFFER,this.data.subarray(0,vertices*12),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices);vertices=0}}
  try{for(const cell of cells){const x=cell.x-originX,y=cell.y-originY,rx=cell.width/2,ry=cell.height/2,pad=shape>3?6:shape>1?1:0;if(rx<.001||ry<.001||x+rx+pad<0||y+ry+pad<0||x-rx-pad>target.width||y-ry-pad>target.height)continue;if(vertices===1024*6)flush();for(const[a,b]of CORNERS){const at=vertices++*12,d=this.data;d[at]=x+a*(rx+pad);d[at+1]=y+b*(ry+pad);d[at+2]=a*(rx+pad);d[at+3]=b*(ry+pad);d[at+4]=rx;d[at+5]=ry;d[at+6]=(Math.floor(cell.sampleX)+.5-rect.minX)/span;d[at+7]=1-(Math.floor(cell.sampleY)+.5-rect.minY)/span;d[at+8]=replace&&randomOpacity?Math.sqrt(cell.alpha):cell.alpha;d[at+9]=cell.hsv?.[0]??0;d[at+10]=cell.hsv?.[1]??0;d[at+11]=cell.hsv?.[2]??0}}flush()}finally{for(const loc of locations)gl.disableVertexAttribArray(loc);target.endDraw()}
 }
 /** Native rectangle COPY ordering, opacity1; no lazy program in new137. */
 paintRequest(cells:readonly GridCell[],target:AccumulationBuffer,originX:number,originY:number,source:AccumulationBuffer,rect:{minX:number;minY:number},span:number,color:readonly number[]=[0,0,0,0],shape=1,sample=true):void{
  if(source.texture===target.texture)throw Error('Grid request source aliases target')
  this.assertPrepared();this.paint(cells,target,originX,originY,source,rect,span,color,shape,sample,false,1,undefined,-1,true,true)
 }
 /** A request is composited once, after background and all ordered cells.
  * Target-sized scratch has the same top-down origin; no readback or feedback. */
 transfer(source:AccumulationBuffer,target:AccumulationBuffer,opacity:number):void{
  const gl=this.gl
  this.transferProgram??=createProgram(gl,`attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`,`precision highp float;varying vec2 v_uv;uniform sampler2D u_source;uniform float u_opacity;void main(){gl_FragColor=texture2D(u_source,v_uv)*u_opacity;}`)
  this.prepare();const p=this.transferProgram;target.beginDraw();let loc=-1
  try{gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer!);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STREAM_DRAW);loc=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);gl.uniform1i(gl.getUniformLocation(p,'u_source'),0);gl.uniform1f(gl.getUniformLocation(p,'u_opacity'),opacity);gl.drawArrays(gl.TRIANGLES,0,6)}finally{if(loc>=0)gl.disableVertexAttribArray(loc);target.endDraw()}
 }

}
