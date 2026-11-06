import type{GridCell}from'../presets/brushGrid'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{createProgram}from'../raster/utils'
const VERT=`attribute vec2 a_position;attribute vec4 a_local;attribute vec3 a_sample;uniform vec2 u_resolution;varying vec4 v_local;varying vec3 v_sample;void main(){v_local=a_local;v_sample=a_sample;vec2 p=a_position/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision highp float;varying vec4 v_local;varying vec3 v_sample;uniform sampler2D u_source;uniform vec3 u_color;uniform vec4 u_style;
void main(){vec2 p=v_local.xy,h=max(v_local.zw,vec2(.0001));float a=1.;
if(u_style.x<.5)a=clamp(.5+(1.-length(p/h))*min(h.x,h.y),0.,1.);
else if(u_style.x<1.5)a=step(abs(p.x),h.x)*step(abs(p.y),h.y);
else{vec2 start=vec2(h.x,-h.y),delta=vec2(-2.*h.x,2.*h.y);float t=clamp(dot(p-start,delta)/max(dot(delta,delta),.0001),0.,1.),radius=u_style.x>3.5?(1.+9.*t)*.5:.5;float d=length(p-start-t*delta);a=u_style.x<2.5?step(d,radius):clamp(.5+radius-d,0.,1.);}
if(a<=0.)discard;vec4 color=u_style.y>.5?texture2D(u_source,v_sample.xy):vec4(u_color,1.);if(u_style.w>.5)color=vec4(color.rgb/max(color.a,.00392157),1.);gl_FragColor=color*(a*v_sample.z*u_style.z);}`
const CORNERS=[[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]]as const
/** Bounded ordered cell batch; source is gathered once before any write. */
export class GridCellBatch{
 private program?:WebGLProgram
 private buffer?:WebGLBuffer
 private data=new Float32Array(1024*6*9)
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 reset():void{this.program=undefined;this.buffer=undefined}
 destroy():void{if(this.program)this.gl.deleteProgram(this.program);if(this.buffer)this.gl.deleteBuffer(this.buffer);this.reset()}
 prepare():void{this.program??=createProgram(this.gl,VERT,FRAG);this.buffer??=this.gl.createBuffer()!}
 paint(cells:readonly GridCell[],target:AccumulationBuffer,originX:number,originY:number,source:AccumulationBuffer,rect:{minX:number;minY:number},span:number,color:readonly number[],shape:number,sample:boolean,randomOpacity:boolean,opacity:number):void{
  this.prepare();const gl=this.gl,p=this.program!;target.beginDraw();gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer!);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);gl.uniform1i(gl.getUniformLocation(p,'u_source'),0);gl.uniform2f(gl.getUniformLocation(p,'u_resolution'),target.width,target.height);gl.uniform3f(gl.getUniformLocation(p,'u_color'),color[0],color[1],color[2]);gl.uniform4f(gl.getUniformLocation(p,'u_style'),shape,sample?1:0,opacity,randomOpacity?1:0)
  const attributes=[['a_position',2,0],['a_local',4,2],['a_sample',3,6]]as const,locations=attributes.map(([name,size,offset])=>{const loc=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,36,offset*4);return loc});let vertices=0
  const flush=()=>{if(vertices){gl.bufferData(gl.ARRAY_BUFFER,this.data.subarray(0,vertices*9),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices);vertices=0}}
  try{for(const cell of cells){const x=cell.x-originX,y=cell.y-originY,rx=cell.width/2,ry=cell.height/2,pad=shape>3?6:shape>1?1:0;if(rx<.001||ry<.001||x+rx+pad<0||y+ry+pad<0||x-rx-pad>target.width||y-ry-pad>target.height)continue;if(vertices===1024*6)flush();for(const[a,b]of CORNERS){const at=vertices++*9,d=this.data;d[at]=x+a*(rx+pad);d[at+1]=y+b*(ry+pad);d[at+2]=a*(rx+pad);d[at+3]=b*(ry+pad);d[at+4]=rx;d[at+5]=ry;d[at+6]=(Math.floor(cell.sampleX)+.5-rect.minX)/span;d[at+7]=1-(Math.floor(cell.sampleY)+.5-rect.minY)/span;d[at+8]=cell.alpha}}flush()}finally{for(const loc of locations)gl.disableVertexAttribArray(loc);target.endDraw()}
 }
}
