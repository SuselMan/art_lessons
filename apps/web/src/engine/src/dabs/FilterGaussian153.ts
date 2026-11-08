import{hasFilterGaussian153Scope,type BrushDescriptor}from'@grafetto/shared'
import type{PaintTarget}from'../buffers/ILayerBuffer'
import type{WorldRect}from'../buffers/tileMath'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{FilterSmudge147State,FilterSmudge147Request}from'./FilterSmudge147'
import{CanvasProjectionSampler}from'../raster/CanvasProjectionSampler'
import{createProgram,createFullscreenQuad}from'../raster/utils'
import{filterKernel}from'../presets/brushFilter'
import{FILTER_GAUSSIAN_BLUR_GLSL}from'./filterGaussianKernel'
const VERT=`attribute vec2 a_position;uniform vec2 u_resolution;uniform vec4 u_rect;void main(){vec2 p=(u_rect.xy+(a_position*.5+.5)*u_rect.zw)/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const OVER=`precision highp float;uniform sampler2D u_source;uniform sampler2D u_old;uniform vec2 u_resolution;uniform vec4 u_needed;void main(){vec2 uv=gl_FragCoord.xy/u_resolution,p=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);vec4 s=texture2D(u_source,uv),t=texture2D(u_old,uv);bool inside=p.x>=u_needed.x&&p.y>=u_needed.y&&p.x<u_needed.z&&p.y<u_needed.w;gl_FragColor=inside?s+t*(1.-s.a):t;}`
const COPY=`precision highp float;uniform sampler2D u_current;uniform sampler2D u_filtered;uniform sampler2D u_mask;uniform vec2 u_resolution;uniform vec2 u_stageResolution;uniform vec4 u_patch;uniform vec2 u_currentOrigin;void main(){vec2 p=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);vec2 c=(p-u_currentOrigin)/u_stageResolution;vec2 f=(p-u_patch.xy)/u_patch.zw;vec4 d=texture2D(u_current,vec2(c.x,1.-c.y)),v=texture2D(u_filtered,vec2(f.x,1.-f.y));float m=texture2D(u_mask,gl_FragCoord.xy/u_resolution).a;gl_FragColor=mix(d,v,clamp(m,0.,1.));}`
function intersection(a:WorldRect,b:WorldRect):WorldRect|undefined{const r={minX:Math.max(a.minX,b.minX),minY:Math.max(a.minY,b.minY),maxX:Math.min(a.maxX,b.maxX),maxY:Math.min(a.maxY,b.maxY)};return r.maxX>r.minX&&r.maxY>r.minY?r:undefined}
const extent=(tile:PaintTarget):WorldRect=>({minX:tile.originX,minY:tile.originY,maxX:tile.originX+tile.buffer.width,maxY:tile.originY+tile.buffer.height})
/** No owned pixel buffers: all four stages and persistent T are SAME147 leases. */
export class FilterGaussian153Pass{
 private geometry?:WebGLBuffer
 private over?:WebGLProgram
 private blur?:WebGLProgram
 private copy?:WebGLProgram
 private readonly gl:WebGLRenderingContext
 private readonly sampler:CanvasProjectionSampler
 constructor(gl:WebGLRenderingContext){this.gl=gl;this.sampler=new CanvasProjectionSampler(gl,()=>this.geometry!)}
 prepare():void{this.geometry??=createFullscreenQuad(this.gl);this.over??=createProgram(this.gl,VERT,OVER);this.blur??=createProgram(this.gl,VERT,FILTER_GAUSSIAN_BLUR_GLSL);this.copy??=createProgram(this.gl,VERT,COPY);this.sampler.prepare()}
 forget():void{this.geometry=undefined;this.over=undefined;this.blur=undefined;this.copy=undefined;this.sampler.forget()}
 destroy():void{for(const p of[this.over,this.blur,this.copy])if(p)this.gl.deleteProgram(p);if(this.geometry)this.gl.deleteBuffer(this.geometry);this.sampler.destroy();this.forget()}
 private draw(program:WebGLProgram,target:AccumulationBuffer,r:WorldRect):void{const g=this.gl;g.useProgram(program);g.uniform2f(g.getUniformLocation(program,'u_resolution'),target.width,target.height);g.uniform4f(g.getUniformLocation(program,'u_rect'),r.minX,r.minY,r.maxX-r.minX,r.maxY-r.minY);g.bindBuffer(g.ARRAY_BUFFER,this.geometry!);const a=g.getAttribLocation(program,'a_position');g.enableVertexAttribArray(a);g.vertexAttribPointer(a,2,g.FLOAT,false,0,0);try{g.drawArrays(g.TRIANGLES,0,6)}finally{g.disableVertexAttribArray(a)}}
 private bind(program:WebGLProgram,items:readonly(readonly[number,AccumulationBuffer,string])[]):void{for(const[unit,buffer,name]of items){this.gl.activeTexture(this.gl.TEXTURE0+unit);this.gl.bindTexture(this.gl.TEXTURE_2D,buffer.texture);this.gl.uniform1i(this.gl.getUniformLocation(program,name),unit)}}
 private store(source:AccumulationBuffer,origin:{x:number;y:number},tile:PaintTarget,r:WorldRect):void{const hit=intersection(extent(tile),r);if(!hit)return;source.copyRegionInto(tile.buffer,hit.minX-origin.x,source.height-(hit.maxY-origin.y),hit.minX-tile.originX,tile.buffer.height-(hit.maxY-tile.originY),hit.maxX-hit.minX,hit.maxY-hit.minY)}
 paint(brush:BrushDescriptor,state:FilterSmudge147State,request:FilterSmudge147Request):void{
  if(!hasFilterGaussian153Scope(brush)||!request.spatial||request.stages.length!==4||!this.over||!this.blur||!this.copy||!this.geometry)throw Error('Gaussian153 plan/program missing')
  const f=brush.filter!;if(!('radiusX'in f))throw Error('Gaussian153 radii missing');request.assertCurrent()
  const plan=request.spatial,[filtered,old,u,horizontal]=request.stages.map(x=>x.buffer),g=this.gl,side=plan.side,origin={x:plan.needed.minX,y:plan.needed.minY},world={minX:origin.x,minY:origin.y,maxX:origin.x+side,maxY:origin.y+side},full={minX:0,minY:0,maxX:side,maxY:side},temporary=request.temporaryTiles()
  const privateTextures=new Set([...request.stages.map(x=>x.buffer.texture),...temporary.map(x=>x.buffer.texture)])
  for(const{tile,mask}of plan.destinations)if(privateTextures.has(tile.buffer.texture)||privateTextures.has(mask.texture)||tile.buffer.texture===mask.texture||mask.width!==tile.buffer.width||mask.height!==tile.buffer.height)throw Error('Gaussian153 sampled destination/mask alias')
  // Both S and ALL old T are gathered before ANY persistent write; physicaltile order cannot affect F.
  this.sampler.gather(filtered,world,[{opacity:1,buffer:{resolveVisible:r=>[...state.source.resolveForRead(r)]}}])
  this.sampler.gather(old,world,[{opacity:1,buffer:{resolveVisible:()=>temporary.map(t=>({...t,contentRect:extent(t)}))}}])
  u.beginReplaceDraw();try{g.useProgram(this.over);this.bind(this.over,[[0,filtered,'u_source'],[1,old,'u_old']]);g.uniform4f(g.getUniformLocation(this.over,'u_needed'),0,0,plan.needed.maxX-origin.x,plan.needed.maxY-origin.y);this.draw(this.over,u,full)}finally{u.endDraw()}
  // S stage is dead after OVER, so vertical output reuses it; no fifth plane/bank.
  for(const[input,output,axis,radius]of[[u,horizontal,0,f.radiusX],[horizontal,filtered,1,f.radiusY]]as const){output.beginReplaceDraw();try{g.useProgram(this.blur);this.bind(this.blur,[[0,input,'u_source']]);g.uniform2f(g.getUniformLocation(this.blur,'u_step'),axis===0?1/side:0,axis===1?1/side:0);g.uniform1fv(g.getUniformLocation(this.blur,'u_weights[0]'),filterKernel(radius,true));this.draw(this.blur,output,full)}finally{output.endDraw()}}
  request.assertCurrent()
  // Publish the native temporary device: U over neededRect, then F(U) over dabRect only.
  for(const tile of temporary)this.store(u,origin,tile,plan.needed)
  for(const tile of temporary)this.store(filtered,origin,tile,plan.bounds)
  for(const{tile,mask}of plan.destinations){const r=intersection(extent(tile),plan.bounds);if(!r)continue;const left=r.minX-tile.originX,top=r.minY-tile.originY,w=r.maxX-r.minX,h=r.maxY-r.minY
   tile.buffer.copyRegionInto(old,left,tile.buffer.height-(top+h),0,old.height-h,w,h)
   tile.buffer.beginReplaceDraw();try{g.useProgram(this.copy);this.bind(this.copy,[[0,old,'u_current'],[1,filtered,'u_filtered'],[2,mask,'u_mask']]);g.uniform2f(g.getUniformLocation(this.copy,'u_stageResolution'),side,side);g.uniform2f(g.getUniformLocation(this.copy,'u_currentOrigin'),left,top);g.uniform4f(g.getUniformLocation(this.copy,'u_patch'),origin.x-tile.originX,origin.y-tile.originY,side,side);this.draw(this.copy,tile.buffer,{minX:left,minY:top,maxX:left+w,maxY:top+h})}finally{tile.buffer.endDraw()}
  }
 }
}
