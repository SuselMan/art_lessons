import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{createProgram}from'../raster/utils'
import type{PreparedBrushImageView}from'./PreparedBrushImageView'
export interface SprayImageParticle{
 readonly x:number;readonly y:number;readonly width:number;readonly height:number
 readonly angle:number;readonly opacity:number;readonly hsv:readonly[number,number,number]
}
const CORNERS=[[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]]as const
const VERT=`attribute vec2 a_position;attribute vec2 a_uv;attribute vec3 a_hsv;attribute float a_opacity;uniform vec2 u_resolution;varying vec2 v_uv;varying vec3 v_hsv;varying float v_opacity;void main(){v_uv=a_uv;v_hsv=a_hsv;v_opacity=a_opacity;vec2 p=a_position/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision highp float;uniform sampler2D u_image;uniform vec4 u_bounds;varying vec2 v_uv;varying vec3 v_hsv;varying float v_opacity;
vec3 adjustHsv(vec3 c,vec3 adj){float v=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),ch=v-lo;float vv=clamp(adj.z>=0.?v+adj.z*(1.-v):v*(1.+adj.z),0.,1.);if(ch<=.000000001||v<=.000000001)return vec3(vv);float h=v==c.r?mod((c.g-c.b)/ch,6.):v==c.g?(c.b-c.r)/ch+2.:(c.r-c.g)/ch+4.;h=mod(h+adj.x*3.+12.,6.);float sc=adj.y>0.?1.+adj.y+2.*adj.y*adj.y:1.+adj.y;float cc=min(vv,min(1.,ch*sc)*(1.-abs(adj.z))),xx=cc*(1.-abs(mod(h,2.)-1.));vec3 q=h<1.?vec3(cc,xx,0.):h<2.?vec3(xx,cc,0.):h<3.?vec3(0.,cc,xx):h<4.?vec3(0.,xx,cc):h<5.?vec3(xx,0.,cc):vec3(cc,0.,xx);return q+vec3(vv-cc);}
void main(){vec4 c=texture2D(u_image,clamp(v_uv,u_bounds.xy,u_bounds.zw));if(any(notEqual(v_hsv,vec3(0.)))){vec3 straight=c.a>0.?c.rgb/c.a:vec3(0.);c.rgb=adjustHsv(straight,v_hsv)*c.a;}gl_FragColor=c*v_opacity;}`
/** Ordered image particles preserve their own premultiplied RGB. HSV affects
 * image pixels, while random painter opacity scales the image exactly once.
 * One borrowed texture per call; fixed 512-particle vertex staging, <=4096 work. */
export class SprayImageBatch{
 private program?:WebGLProgram
 private buffer?:WebGLBuffer
 private readonly data=new Float32Array(512*6*8)
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 reset():void{this.program=undefined;this.buffer=undefined}
 destroy():void{if(this.program)this.gl.deleteProgram(this.program);if(this.buffer)this.gl.deleteBuffer(this.buffer);this.reset()}
 prepare():void{this.program??=createProgram(this.gl,VERT,FRAG);this.buffer??=this.gl.createBuffer()!}
 paint(list:readonly SprayImageParticle[],view:PreparedBrushImageView,target:AccumulationBuffer,originX:number,originY:number):void{
  const c=view.crop,finite=(n:number)=>Number.isFinite(n)
  if(list.length>4096||![view.width,view.height].every(Number.isSafeInteger)||![c.x,c.y,c.width,c.height].every(Number.isFinite)||view.width<1||view.height<1||c.x<0||c.y<0||c.width<1||c.height<1||c.x+c.width>view.width||c.y+c.height>view.height||!finite(originX)||!finite(originY)||view.texture===target.texture)throw new RangeError('Invalid Spray image view or work')
  for(const p of list)if(![p.x,p.y,p.width,p.height,p.angle,p.opacity,...p.hsv].every(finite)||p.width<=0||p.height<=0||p.opacity<0||p.opacity>1||p.hsv.length!==3||p.hsv.some(v=>v< -1||v>1)||!finite(p.width+p.height))throw new RangeError('Invalid Spray image particle')
  view.assertCurrent();if(!list.length)return
  this.prepare();const gl=this.gl,program=this.program!,locations:number[]=[]
  // Preparation can invoke owner-controlled context allocation. Recheck before
  // acquiring the target write scope; failure has not touched target pixels.
  view.assertCurrent();target.beginDraw()
  try{
   gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer!);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,view.texture);gl.uniform1i(gl.getUniformLocation(program,'u_image'),0);gl.uniform4f(gl.getUniformLocation(program,'u_bounds'),(c.x+.5)/view.width,(c.y+.5)/view.height,(c.x+c.width-.5)/view.width,(c.y+c.height-.5)/view.height);gl.uniform2f(gl.getUniformLocation(program,'u_resolution'),target.width,target.height)
   for(const[name,size,offset]of[['a_position',2,0],['a_uv',2,2],['a_hsv',3,4],['a_opacity',1,7]]as const){const loc=gl.getAttribLocation(program,name);locations.push(loc);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,offset*4)}
   let vertices=0
   const flush=()=>{if(vertices){gl.bufferData(gl.ARRAY_BUFFER,this.data.subarray(0,vertices*8),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices);vertices=0}}
   for(const p of list){
    const rx=p.width/2,ry=p.height/2,x=p.x-originX,y=p.y-originY,cos=Math.cos(p.angle),sin=Math.sin(p.angle),extent=rx+ry
    if(x+extent<0||y+extent<0||x-extent>target.width||y-extent>target.height||p.opacity===0)continue
    if(vertices===512*6)flush()
    for(const[a,b]of CORNERS){const at=vertices++*8,d=this.data;d[at]=x+a*rx*cos-b*ry*sin;d[at+1]=y+a*rx*sin+b*ry*cos;d[at+2]=(c.x+(a+1)*.5*c.width)/view.width;d[at+3]=(c.y+(b+1)*.5*c.height)/view.height;d[at+4]=p.hsv[0];d[at+5]=p.hsv[1];d[at+6]=p.hsv[2];d[at+7]=p.opacity}
   }flush()
  }finally{for(const loc of locations)gl.disableVertexAttribArray(loc);target.endDraw()}
 }
}
