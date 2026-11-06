import type {BehaviorPlaced} from '../presets/brushBehavior'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {createProgram} from '../raster/utils'
const CORNERS=[[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]] as const
const VERT=`attribute vec2 a_position;attribute vec2 a_local;attribute vec4 a_color;attribute vec2 a_extent;
uniform vec2 u_resolution;varying vec2 v_local;varying vec4 v_color;varying vec2 v_extent;
void main(){v_local=a_local;v_color=a_color;v_extent=a_extent;vec2 p=a_position/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision highp float;varying vec2 v_local;varying vec4 v_color;varying vec2 v_extent;uniform float u_aa;
void main(){float d=length(vec2(max(abs(v_local.x)-v_extent.x,0.),v_local.y))-v_extent.y;
float a=(u_aa>.5?clamp(.5-d,0.,1.):(d<=0.?1.:0.))*v_color.a;if(a<=0.)discard;gl_FragColor=vec4(v_color.rgb*a,a);}`
const COPY_VERT=`attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=(a_position+1.)*.5;gl_Position=vec4(a_position,0.,1.);}`
const COPY_FRAG=`precision highp float;uniform sampler2D u_source;uniform float u_opacity;varying vec2 v_uv;void main(){gl_FragColor=texture2D(u_source,v_uv)*u_opacity;}`
/** One temporary request image preserves group opacity at intersecting lines.
 * Both images are the existing coverage/ceiling scratch; no new tile surfaces. */
export class SketchLineBatch{
 private readonly gl:WebGLRenderingContext
 private program?:WebGLProgram
 private composite?:WebGLProgram
 private buffer?:WebGLBuffer
 private quad?:WebGLBuffer
 private data=new Float32Array(2048*6*10)
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 reset():void{this.program=undefined;this.composite=undefined;this.buffer=undefined;this.quad=undefined}
 destroy():void{const gl=this.gl;if(this.program)gl.deleteProgram(this.program);if(this.composite)gl.deleteProgram(this.composite);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.quad)gl.deleteBuffer(this.quad);this.reset()}
 prepare():void{
  const gl=this.gl
  this.program??=createProgram(gl,VERT,FRAG);this.composite??=createProgram(gl,COPY_VERT,COPY_FRAG);this.buffer??=gl.createBuffer()!
  if(!this.quad){this.quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)}
 }
 paint(stamps:readonly BehaviorPlaced[],coverage:AccumulationBuffer,temporary:AccumulationBuffer,originX:number,originY:number,aa:boolean):void{
  this.prepare();const gl=this.gl,program=this.program!,composite=this.composite!
  for(let first=0;first<stamps.length;){
   let end=first+1;while(end<stamps.length&&stamps[end].group===stamps[first].group)end++
   temporary.clear();temporary.beginDraw();gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer!)
   gl.uniform2f(gl.getUniformLocation(program,'u_resolution'),coverage.width,coverage.height);gl.uniform1f(gl.getUniformLocation(program,'u_aa'),aa?1:0)
   const attributes=[['a_position',2,0],['a_local',2,2],['a_color',4,4],['a_extent',2,8]] as const
   const locations=attributes.map(([name,size,offset])=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,40,offset*4);return loc})
   let vertices=0
   const flush=()=>{if(vertices){gl.bufferData(gl.ARRAY_BUFFER,this.data.subarray(0,vertices*10),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices);vertices=0}}
   try{
    for(let i=first;i<end;i++){
     const s=stamps[i],length=(s.segmentLength??0)*.5,width=s.radius,cx=s.x-originX,cy=s.y-originY,rx=length+width+1,ry=width+1
     if(cx+rx+ry<0||cy+rx+ry<0||cx-rx-ry>coverage.width||cy-rx-ry>coverage.height)continue
     if(vertices===2048*6)flush()
     const c=Math.cos(s.angle),sn=Math.sin(s.angle),d=this.data
     for(const [a,b]of CORNERS){const at=vertices++*10;d[at]=cx+a*rx*c-b*ry*sn;d[at+1]=cy+a*rx*sn+b*ry*c;d[at+2]=a*rx;d[at+3]=b*ry;d[at+4]=s.color[0];d[at+5]=s.color[1];d[at+6]=s.color[2];d[at+7]=s.flow;d[at+8]=length;d[at+9]=width}
    }
    flush()
   }finally{for(const loc of locations)gl.disableVertexAttribArray(loc);temporary.endDraw()}
   coverage.beginDraw();gl.useProgram(composite);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,temporary.texture)
   gl.uniform1i(gl.getUniformLocation(composite,'u_source'),0);gl.uniform1f(gl.getUniformLocation(composite,'u_opacity'),stamps[first].ceiling)
   gl.bindBuffer(gl.ARRAY_BUFFER,this.quad!);const position=gl.getAttribLocation(composite,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(position);coverage.endDraw()
   first=end
  }
 }
}
