import type { BrushSpray } from '@grafetto/shared'
import type { BehaviorPlaced } from '../presets/brushBehavior'
import { createProgram } from '../raster/utils'
const CORNERS=[[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]] as const
const VERT=`
attribute vec2 a_position;
attribute vec2 a_local;
attribute vec4 a_color;
attribute vec2 a_radius;
uniform vec2 u_resolution;
varying vec2 v_local;
varying vec4 v_color;
varying vec2 v_radius;
void main(){v_local=a_local;v_color=a_color;v_radius=a_radius;
 vec2 p=a_position/u_resolution*2.0-1.0;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision highp float;
varying vec2 v_local;varying vec4 v_color;varying vec2 v_radius;
uniform float u_shape;
void main(){
 float a;
 if(u_shape>2.5){vec2 p=max(vec2(0.),1.0-abs(v_local));a=p.x*p.y;}
 else if(u_shape>1.5){a=1.0;}
 else {float d=u_shape<.5?length(v_local):max(abs(v_local.x),abs(v_local.y));
 float aa=1.0/max(.5,min(v_radius.x,v_radius.y));a=clamp((1.0-d)/aa+.5,0.,1.);}
 a*=v_color.a;if(a<=0.)discard;gl_FragColor=vec4(v_color.rgb*a,a);}`
/** Ordered triangles preserve OVER even when particles overlap. Fixed staging
 * storage bounds uploads; no instancing extension or per-particle GL calls. */
export class SprayShapeBatch {
 private program?:WebGLProgram
 private buffer?:WebGLBuffer
 private data=new Float32Array(2048*6*10)
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 reset():void{this.program=undefined;this.buffer=undefined}
 destroy():void{if(this.program)this.gl.deleteProgram(this.program);if(this.buffer)this.gl.deleteBuffer(this.buffer);this.reset()}
 paint(list:readonly BehaviorPlaced[],shape:BrushSpray['particle']['shape'],x:number,y:number,width:number,height:number):void{
  const gl=this.gl
  this.program??=createProgram(gl,VERT,FRAG);this.buffer??=gl.createBuffer()!
  const program=this.program
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer)
  gl.uniform2f(gl.getUniformLocation(program,'u_resolution'),width,height)
  gl.uniform1f(gl.getUniformLocation(program,'u_shape'),shape==='ellipse'?0:shape==='rectangle'?1:shape==='pixel'?2:3)
  const attributes=[['a_position',2,0],['a_local',2,2],['a_color',4,4],['a_radius',2,8]] as const
  const locations=attributes.map(([name,size,offset])=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,40,offset*4);return loc})
  let vertices=0
  const flush=():void=>{if(!vertices)return;gl.bufferData(gl.ARRAY_BUFFER,this.data.subarray(0,vertices*10),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices);vertices=0}
  try{
   for(const s of list){
    const rx=shape==='pixel'?.5:shape==='bilinear'?1:s.radius*s.aspect,ry=shape==='pixel'?.5:shape==='bilinear'?1:s.radius
    const cx=(shape==='pixel'?Math.round(s.x):s.x)-x,cy=(shape==='pixel'?Math.round(s.y):s.y)-y
    if(cx+rx+ry<0||cy+rx+ry<0||cx-rx-ry>width||cy-rx-ry>height)continue
    const pad=shape==='pixel'||shape==='bilinear'?0:.5,ex=rx+pad,ey=ry+pad,c=Math.cos(s.angle),sn=Math.sin(s.angle)
    if(vertices===2048*6)flush()
    for(const [a,b] of CORNERS){
     const p=vertices++*10
     const d=this.data
     d[p]=cx+a*ex*c-b*ey*sn;d[p+1]=cy+a*ex*sn+b*ey*c
     d[p+2]=a*ex/rx;d[p+3]=b*ey/ry
     d[p+4]=s.color[0];d[p+5]=s.color[1];d[p+6]=s.color[2]
     d[p+7]=s.flow*s.ceiling;d[p+8]=rx;d[p+9]=ry
    }
   }
   flush()
  }finally{for(const loc of locations)gl.disableVertexAttribArray(loc)}
 }
}
