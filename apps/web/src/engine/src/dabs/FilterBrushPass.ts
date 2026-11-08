import type{BrushFilter}from'@grafetto/shared'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer,PaintTarget}from'../buffers/ILayerBuffer'
import type{BrushScratch}from'./BrushPainter'
import type{WorldRect}from'../buffers/tileMath'
import{CanvasProjectionSampler}from'../raster/CanvasProjectionSampler'
import{createProgram,createFullscreenQuad}from'../raster/utils'
import{filterKernel,filterReach}from'../presets/brushFilter'
const VERT=`attribute vec2 a_position;uniform vec2 u_resolution;uniform vec4 u_rect;void main(){vec2 p=(u_rect.xy+(a_position*.5+.5)*u_rect.zw)/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const BLUR=`precision highp float;uniform sampler2D u_source;uniform vec2 u_resolution;uniform vec2 u_step;uniform float u_weights[37];void main(){vec2 uv=gl_FragCoord.xy/u_resolution;vec4 v=vec4(0.);for(int i=0;i<37;i++)if(u_weights[i]>0.)v+=texture2D(u_source,uv+float(i-18)*u_step)*u_weights[i];gl_FragColor=v;}`
const COMPOSITE=`precision highp float;uniform sampler2D u_original;uniform sampler2D u_mask;uniform sampler2D u_filtered;uniform vec2 u_resolution;uniform vec3 u_patch;uniform vec4 u_filter;
vec3 straight(vec4 c){return c.a>0.?c.rgb/c.a:vec3(0.);}
void main(){vec2 uv=gl_FragCoord.xy/u_resolution,pixel=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);vec4 original=texture2D(u_original,uv);float mask=texture2D(u_mask,uv).a;vec4 filtered;if(u_filter.w>2.5){float lo=min(min(original.r,original.g),original.b),hi=max(max(original.r,original.g),original.b);float gray;if(u_filter.x<.5)gray=(lo+hi)*.5;else if(u_filter.x<1.5)gray=dot(original.rgb,vec3(.2126,.7152,.0722));else if(u_filter.x<2.5)gray=dot(original.rgb,vec3(.299,.587,.114));else if(u_filter.x<3.5)gray=(original.r+original.g+original.b)/3.;else if(u_filter.x<4.5)gray=lo;else gray=hi;filtered=vec4(vec3(gray),original.a);}else if(u_filter.w>1.5){filtered=vec4(original.aaa-original.rgb,original.a);}else{vec4 blur=texture2D(u_filtered,vec2((pixel.x-u_patch.x)/u_patch.z,1.-(pixel.y-u_patch.y)/u_patch.z));filtered=blur;
if(u_filter.w>.5){vec3 a=straight(original),b=straight(blur),delta=a-b;float difference=max(max(abs(delta.r),abs(delta.g)),abs(delta.b));if(u_filter.z>.5){float l=dot(delta,vec3(.2126,.7152,.0722));delta=vec3(l);}filtered=vec4(clamp(a+(difference*255.>=u_filter.y?u_filter.x:0.)*delta,0.,1.)*original.a,original.a);}}gl_FragColor=mix(original,filtered,mask);}`
/** Reuses the stroke's original tile images. No second stroke snapshot,
 * GPU readback or whole-layer filter; only dirty bounds plus kernel reach. */
export class FilterBrushPass{
 private blur?:WebGLProgram
 private composite?:WebGLProgram
 private source?:AccumulationBuffer
 private horizontal?:AccumulationBuffer
 private vertical?:AccumulationBuffer
 private readonly sampler:CanvasProjectionSampler
 private readonly gl:WebGLRenderingContext
 private geometry?:WebGLBuffer
 private readonly quad=()=>this.geometry!
 constructor(gl:WebGLRenderingContext){this.gl=gl;this.sampler=new CanvasProjectionSampler(gl,this.quad)}
 prepare():void{this.geometry??=createFullscreenQuad(this.gl);this.blur??=createProgram(this.gl,VERT,BLUR);this.composite??=createProgram(this.gl,VERT,COMPOSITE);this.sampler.prepare()}
 forget():void{this.geometry=undefined;this.blur=undefined;this.composite=undefined;this.source=undefined;this.horizontal=undefined;this.vertical=undefined;this.sampler.forget()}
 destroy():void{if(this.geometry)this.gl.deleteBuffer(this.geometry);if(this.blur)this.gl.deleteProgram(this.blur);if(this.composite)this.gl.deleteProgram(this.composite);this.source?.destroy();this.horizontal?.destroy();this.vertical?.destroy();this.sampler.destroy();this.forget()}
 private buffers(size:number):void{
  if(this.source?.width===size)return
  this.source?.destroy();this.horizontal?.destroy();this.vertical?.destroy()
  this.source=new AccumulationBuffer(this.gl,size,size);this.horizontal=new AccumulationBuffer(this.gl,size,size);this.vertical=new AccumulationBuffer(this.gl,size,size)
 }
 private draw(program:WebGLProgram,target:AccumulationBuffer,rect:WorldRect):void{
  const gl=this.gl;gl.useProgram(program);gl.uniform2f(gl.getUniformLocation(program,'u_resolution'),target.width,target.height);gl.uniform4f(gl.getUniformLocation(program,'u_rect'),rect.minX,rect.minY,rect.maxX-rect.minX,rect.maxY-rect.minY);gl.bindBuffer(gl.ARRAY_BUFFER,this.quad());const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);try{gl.drawArrays(gl.TRIANGLES,0,6)}finally{gl.disableVertexAttribArray(position)}
 }
 paint(filter:BrushFilter,tile:PaintTarget,bounds:WorldRect,mask:AccumulationBuffer,scratch:BrushScratch,target:Pick<ILayerBuffer,'resolveForPaint'>&Partial<Pick<ILayerBuffer,'resolveVisible'>>):void{
  if(filter.kind==='invert'||filter.kind==='desaturate'){
   this.prepare();const gl=this.gl,left=Math.max(0,Math.floor(bounds.minX-tile.originX)),top=Math.max(0,Math.floor(bounds.minY-tile.originY)),right=Math.min(tile.buffer.width,Math.ceil(bounds.maxX-tile.originX)),bottom=Math.min(tile.buffer.height,Math.ceil(bounds.maxY-tile.originY))
   if(right<=left||bottom<=top)return
   const original=scratch.getOrCreate(tile.buffer).original,program=this.composite!
   tile.buffer.beginReplaceDraw();try{
    gl.useProgram(program)
    // All active sampler uniforms bind valid owned textures; no target feedback.
    for(const[unit,texture,name]of[[0,original.texture,'u_original'],[1,mask.texture,'u_mask'],[2,original.texture,'u_filtered']]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,name),unit)}
    gl.uniform3f(gl.getUniformLocation(program,'u_patch'),0,0,1);gl.uniform4f(gl.getUniformLocation(program,'u_filter'),filter.kind==='desaturate'?filter.type:0,0,0,filter.kind==='desaturate'?3:2)
    this.draw(program,tile.buffer,{minX:left,minY:top,maxX:right,maxY:bottom})
   }finally{tile.buffer.endDraw()}
   return
  }
  this.prepare();const gl=this.gl,halo=Math.max(filterReach(filter.radiusX),filterReach(filter.radiusY)),left=Math.max(0,Math.floor(bounds.minX-tile.originX)),top=Math.max(0,Math.floor(bounds.minY-tile.originY)),right=Math.min(tile.buffer.width,Math.ceil(bounds.maxX-tile.originX)),bottom=Math.min(tile.buffer.height,Math.ceil(bounds.maxY-tile.originY))
  if(right<=left||bottom<=top)return
  const required=Math.max(right-left,bottom-top)+halo*2,size=2**Math.ceil(Math.log2(Math.max(8,required)))
  if(size>2048)throw Error('Filter brush patch exceeds bounded tile size')
  this.buffers(size)
  const source=this.source!,horizontal=this.horizontal!,vertical=this.vertical!,x=tile.originX+left-halo,y=tile.originY+top-halo,rect={minX:x,minY:y,maxX:x+size,maxY:y+size},original=scratch.getOrCreate(tile.buffer).original
  this.sampler.gather(source,rect,[{opacity:1,buffer:{resolveVisible:r=>(target.resolveVisible?.(r)??target.resolveForPaint(r)).map(t=>({...t,buffer:scratch.getOrCreate(t.buffer).original}))}}])
  for(const [input,output,axis,radius]of [[source,horizontal,0,filter.radiusX],[horizontal,vertical,1,filter.radiusY]]as const){
   output.beginReplaceDraw();try{gl.useProgram(this.blur!);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,input.texture);gl.uniform1i(gl.getUniformLocation(this.blur!,'u_source'),0);gl.uniform2f(gl.getUniformLocation(this.blur!,'u_step'),axis===0?1/size:0,axis===1?1/size:0);gl.uniform1fv(gl.getUniformLocation(this.blur!,'u_weights[0]'),filterKernel(radius));this.draw(this.blur!,output,{minX:0,minY:0,maxX:size,maxY:size})}finally{output.endDraw()}
  }
  tile.buffer.beginReplaceDraw();try{
   const program=this.composite!;gl.useProgram(program)
   for(const [unit,texture,name]of [[0,original.texture,'u_original'],[1,mask.texture,'u_mask'],[2,vertical.texture,'u_filtered']]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,name),unit)}
   gl.uniform3f(gl.getUniformLocation(program,'u_patch'),x-tile.originX,y-tile.originY,size);gl.uniform4f(gl.getUniformLocation(program,'u_filter'),filter.amount,filter.threshold,filter.lightnessOnly?1:0,filter.kind==='unsharp'?1:0)
   this.draw(program,tile.buffer,{minX:left,minY:top,maxX:right,maxY:bottom})
  }finally{tile.buffer.endDraw()}
 }
}
