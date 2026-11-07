import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{PaintTarget}from'../buffers/ILayerBuffer'
import type{WorldRect}from'../buffers/tileMath'
import{createProgram}from'../raster/utils'
export interface SpraySourcePoint{readonly x:number;readonly y:number}
export interface SpraySourceNeighborhood{readonly index:number;readonly x:number;readonly y:number;readonly weights:readonly[number,number,number,number];readonly normalizer:number}
/** Native real-coordinate sampler: independently rounded four weights; the
 * normalizer is their actual sum, not a silently assumed255. */
export function spraySourceNeighborhoods(points:readonly SpraySourcePoint[]):SpraySourceNeighborhood[]{
 if(points.length>4096)throw new RangeError('Spray source point work exceeds4096')
 return points.map((p,index)=>{const x=Math.floor(p.x),y=Math.floor(p.y)
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||!Number.isSafeInteger(x+1)||!Number.isSafeInteger(y+1))throw new RangeError('Invalid Spray source point')
  const h=p.x-x,v=p.y-y,weights=[Math.floor((1-h)*(1-v)*255+.5),Math.floor(h*(1-v)*255+.5),Math.floor((1-h)*v*255+.5),Math.floor(h*v*255+.5)]as const
  return{index,x,y,weights,normalizer:weights.reduce((a,b)=>a+b,0)}
 })
}
export interface SpraySourceAtlasOwner{
 /** Genuine synchronous request/GL generation guard; never UI selection. */
 assertCurrent():void
 /** Existing charged scratch owner. No global/per-descriptor residency. */
 acquire(size:number):{readonly buffer:AccumulationBuffer;release():void}
 /** Current canonical layer only. Missing pixels are transparent, never paper. */
 readonly cellWidth:number;readonly cellHeight:number
 resolveCells(rect:WorldRect):readonly PaintTarget[]
}
export interface SpraySourceAtlasView{
 readonly buffer:AccumulationBuffer;readonly count:number;readonly size:number
 assertCurrent():void
 /** Idempotent, marks view dead BEFORE releasing the real scratch lease. */
 release():void
}
type Group={rect:WorldRect;cells:readonly(readonly[number,number])[];points:SpraySourceNeighborhood[]}
const VERT=`attribute vec2 a_position;attribute vec4 a_uv01;attribute vec4 a_uv23;attribute vec4 a_weights;uniform float u_size;varying vec4 v_uv01;varying vec4 v_uv23;varying vec4 v_weights;void main(){v_uv01=a_uv01;v_uv23=a_uv23;v_weights=a_weights;vec2 p=a_position/u_size*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);gl_PointSize=1.;}`
const FRAG=`precision highp float;uniform sampler2D u_source0;uniform sampler2D u_source1;uniform sampler2D u_source2;uniform sampler2D u_source3;uniform vec4 u_present;varying vec4 v_uv01;varying vec4 v_uv23;varying vec4 v_weights;void main(){vec4 c=vec4(0.);if(u_present.x>.5)c+=texture2D(u_source0,v_uv01.xy)*v_weights.x;if(u_present.y>.5)c+=texture2D(u_source1,v_uv01.zw)*v_weights.y;if(u_present.z>.5)c+=texture2D(u_source2,v_uv23.xy)*v_weights.z;if(u_present.w>.5)c+=texture2D(u_source3,v_uv23.zw)*v_weights.w;gl_FragColor=c;}`
/** One pre-write request snapshot of particle colours, not a downscaled brush
 * footprint. Four source textures per tuple; one RGBA8 write per output point.
 * Interpolation stays premultiplied, then consumer unmultiples before HSV.
 * Functional canonical-canvas sampling; no ICC/native-byte equality claim. */
export class SpraySourceAtlas{
 private program?:WebGLProgram
 private buffer?:WebGLBuffer
 private epoch={}
 private readonly data=new Float32Array(4096*14)
 private readonly gl:WebGLRenderingContext
 constructor(gl:WebGLRenderingContext){this.gl=gl}
 reset():void{this.epoch={};this.program=undefined;this.buffer=undefined}
 destroy():void{if(this.program)this.gl.deleteProgram(this.program);if(this.buffer)this.gl.deleteBuffer(this.buffer);this.reset()}
 prepare():void{this.program??=createProgram(this.gl,VERT,FRAG);this.buffer??=this.gl.createBuffer()!}
 collect(points:readonly SpraySourcePoint[],owner:SpraySourceAtlasOwner):SpraySourceAtlasView|undefined{
  const epoch=this.epoch,current=()=>{if(epoch!==this.epoch)throw Error('Spray source generation changed');owner.assertCurrent();if(epoch!==this.epoch)throw Error('Spray source generation changed')}
  current();const neighborhoods=spraySourceNeighborhoods(points);if(!points.length)return undefined
  // Metadata-first grouping never retains a GPU tile across resolver calls.
  // One real resolveCells call protects <=4 returned cells until this group
  // has drawn; discard all references before resolving the next group.
  const cw=owner.cellWidth,ch=owner.cellHeight
  if(!Number.isSafeInteger(cw)||!Number.isSafeInteger(ch)||cw<1||ch<1)throw new RangeError('Invalid Spray source cell geometry')
  const groups=new Map<string,Group>()
  for(const n of neighborhoods){
   const cells=Array.from({length:4},(_,k)=>[Math.floor((n.x+k%2)/cw),Math.floor((n.y+Math.floor(k/2))/ch)]as const),key=cells.map(([x,y])=>`${x},${y}`).join('/')
   const known=groups.get(key)
   if(known)known.points.push(n)
   else groups.set(key,{cells,points:[n],rect:{minX:cells[0][0]*cw,minY:cells[0][1]*ch,maxX:(cells[3][0]+1)*cw,maxY:(cells[3][1]+1)*ch}})
  }
  current();let size=1;while(size*size<points.length)size*=2
  const lease=owner.acquire(size),atlas=lease.buffer;let live=true,published=false
  const release=()=>{if(!live)return;live=false;lease.release()}
  const assertCurrent=()=>{if(!live)throw Error('Spray source atlas lease was released');current()}
  let failed=false,failure:unknown
  try{
   current();if(atlas.gl!==this.gl||atlas.width!==size||atlas.height!==size)throw Error('Spray source scratch is invalid or aliases source')
   this.prepare();current();let cleared=false
   const gl=this.gl,program=this.program!
   for(const group of groups.values()){
    current();const resolved=owner.resolveCells(group.rect);current()
    if(resolved.length>4||new Set(resolved.map(t=>`${t.originX},${t.originY}`)).size!==resolved.length)throw Error('Spray source resolver exceeded or duplicated four cells')
    const tiles=group.cells.map(([x,y])=>resolved.find(t=>t.contentRect&&t.originX===x*cw&&t.originY===y*ch))
    for(const tile of resolved)if(tile.buffer.gl!==gl||tile.buffer===atlas||!Number.isSafeInteger(tile.originX)||!Number.isSafeInteger(tile.originY)||tile.buffer.width>cw||tile.buffer.height>ch||!group.cells.some(([x,y])=>tile.originX===x*cw&&tile.originY===y*ch))throw Error('Spray source resolver returned a foreign cell')
    if(!cleared){atlas.clear();cleared=true}
    const fallback=tiles.find(t=>!!t)?.buffer
    if(!fallback)continue
    atlas.beginDraw();const locations:number[]=[],sampling:AccumulationBuffer[]=[]
    let groupFailed=false,groupFailure:unknown

    try{
     gl.disable(gl.BLEND);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer!);gl.uniform1f(gl.getUniformLocation(program,'u_size'),size)
     for(let i=0;i<4;i++){const b=tiles[i]?.buffer??fallback;gl.activeTexture(gl.TEXTURE0+i);if(!sampling.includes(b)){b.setPointSampling(true);sampling.push(b)}gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(gl.getUniformLocation(program,`u_source${i}`),i)}
     gl.uniform4f(gl.getUniformLocation(program,'u_present'),...tiles.map(t=>t?1:0)as[number,number,number,number])
     let offset=0
     for(const n of group.points){const d=this.data;d[offset++]=n.index%size+.5;d[offset++]=Math.floor(n.index/size)+.5
      for(let k=0;k<4;k++){const t=tiles[k],px=n.x+(k%2),py=n.y+Math.floor(k/2);d[offset++]=t?(px-t.originX+.5)/t.buffer.width:0;d[offset++]=t?1-(py-t.originY+.5)/t.buffer.height:0}
      for(let k=0;k<4;k++){const t=tiles[k],px=n.x+k%2,py=n.y+Math.floor(k/2);d[offset++]=t&&px>=t.originX&&py>=t.originY&&px<t.originX+t.buffer.width&&py<t.originY+t.buffer.height?n.weights[k]/n.normalizer:0}
     }
     for(const[name,length,offset]of[['a_position',2,0],['a_uv01',4,2],['a_uv23',4,6],['a_weights',4,10]]as const){const loc=gl.getAttribLocation(program,name);locations.push(loc);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,length,gl.FLOAT,false,56,offset*4)}
     gl.bufferData(gl.ARRAY_BUFFER,this.data.subarray(0,offset),gl.STREAM_DRAW);gl.drawArrays(gl.POINTS,0,group.points.length)
    }catch(error){groupFailed=true;groupFailure=error}
    const clean=(fn:()=>void)=>{try{fn()}catch(error){if(!groupFailed){groupFailed=true;groupFailure=error}}}
    for(const loc of locations)clean(()=>gl.disableVertexAttribArray(loc))
    for(const b of sampling)clean(()=>b.setPointSampling(false))
    clean(()=>atlas.endDraw())
    if(groupFailed)throw groupFailure
   }
   if(!cleared)atlas.clear()
   current();published=true
  }catch(error){failed=true;failure=error}
  if(!published){try{release()}catch(error){if(!failed){failed=true;failure=error}}}
  if(failed)throw failure
  return{buffer:atlas,size,count:points.length,assertCurrent,release}
 }
}
