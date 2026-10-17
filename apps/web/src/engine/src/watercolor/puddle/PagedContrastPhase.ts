import { AccumulationBuffer } from '../../buffers/AccumulationBuffer'
import { createProgram } from '../../raster/utils'
import { puddleDimensions, puddleLowDimensions, type PuddleSize } from './PuddleDimensions'
import type { ReadPuddleParameters } from './PuddleParameters'
import type { MaterialFieldSnapshot, MaterialRect } from './MaterialFieldPages'
import { retainedComponents } from './retainedComponents'

export type PagedBufferFactory = (width: number, height: number, filter: 'linear' | 'nearest') => AccumulationBuffer
export interface PagedRawFields { p: MaterialFieldSnapshot; c: MaterialFieldSnapshot; water: MaterialFieldSnapshot }
export const PAGED_VERTEX = 'attribute vec2 pos;varying vec2 uv;varying vec2 localUV;uniform vec2 origin,extent,worldSize;void main(){localUV=pos*.5+.5;uv=origin+localUV*extent;gl_Position=vec4(pos,0.,1.);}'
/** Nearest raw taps, packed as tap blocks inside each coarse cell. CPU does no physics.
 * Reads are bounded page-row batches, including on extremely wide finite sheets. */
export function buildPagedTapAtlas(source: MaterialFieldSnapshot, grid: {width:number;height:number}, offsets: readonly number[]): Uint8Array {
 const n=offsets.length, aw=grid.width*n, bytes=new Uint8Array(aw*grid.height*n*4)
 for(let y=0;y<grid.height;y++)for(let ty=0;ty<n;ty++){
  const sy=Math.max(0,Math.min(source.height-1,Math.floor((y+.5)*source.height/grid.height+offsets[ty]!)))
  const cache=new Map<number,Uint8Array>()
  for(let x=0;x<grid.width;x++)for(let tx=0;tx<n;tx++){
   const sx=Math.max(0,Math.min(source.width-1,Math.floor((x+.5)*source.width/grid.width+offsets[tx]!)))
   const page=Math.floor(sx/source.pageSize),start=page*source.pageSize
   let row=cache.get(page)
   if(!row){row=source.readRect({x:start,y:sy,width:Math.min(source.pageSize,source.width-start),height:1});cache.set(page,row)}
   const from=(sx-start)*4,to=((y*n+ty)*aw+x*n+tx)*4
   bytes[to]=row[from]!;bytes[to+1]=row[from+1]!;bytes[to+2]=row[from+2]!;bytes[to+3]=row[from+3]!
  }
 }
 return bytes
}
export function createPagedDraw(gl:WebGLRenderingContext,size:{width:number;height:number}) {
 const quad=gl.createBuffer()!
 gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 return {
  draw(program:WebGLProgram,out:AccumulationBuffer,textures:Record<string,AccumulationBuffer>,rect:MaterialRect={x:0,y:0,...size},uniforms?:()=>void){
   if(Object.values(textures).some(b=>b.texture===out.texture))throw Error('Paged draw cannot sample its output texture')
   out.beginReplaceDraw();try{gl.disable(gl.SCISSOR_TEST);gl.useProgram(program)
   gl.bindBuffer(gl.ARRAY_BUFFER,quad);const a=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0)
   Object.entries(textures).forEach(([name,b],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(gl.getUniformLocation(program,name),i)})
   gl.uniform2f(gl.getUniformLocation(program,'origin'),rect.x/size.width,rect.y/size.height);gl.uniform2f(gl.getUniformLocation(program,'extent'),rect.width/size.width,rect.height/size.height);gl.uniform2f(gl.getUniformLocation(program,'worldSize'),size.width,size.height);gl.uniform2f(gl.getUniformLocation(program,'windowOrigin'),rect.x,rect.y);gl.uniform2f(gl.getUniformLocation(program,'windowExtent'),rect.width,rect.height)
   uniforms?.();gl.drawArrays(gl.TRIANGLES,0,6)}finally{try{out.endDraw()}finally{gl.activeTexture(gl.TEXTURE0)}}
  },destroy(){gl.deleteBuffer(quad)}
 }
}
/** One global low grid for the entire finite field, never one component filter per storage page. */
export function createPagedContrastPhase(gl:WebGLRenderingContext,readParameters:ReadPuddleParameters,size:PuddleSize,factory?:PagedBufferFactory){
 const dimensions=puddleDimensions(size),low=puddleLowDimensions(size)
 const make=factory??((w,h,f)=>new AccumulationBuffer(gl,w,h,f)),draw=createPagedDraw(gl,dimensions)
 const common='precision highp float;varying vec2 uv;varying vec2 localUV;uniform sampler2D color,water;uniform float volume;float V(vec2 p){vec4 w=texture2D(water,localUV);return volume>.5?4.*w.a:w.b;}'
 const bg=createProgram(gl,PAGED_VERTEX,`precision highp float;varying vec2 uv;uniform sampler2D taps;uniform vec2 grid,stride;void main(){vec4 c=vec4(0.);float v=0.;for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 p=uv+vec2(float(x),float(y))*stride;if(min(min(p.x,p.y),min(1.-p.x,1.-p.y))<0.)continue;float weight=(3.-abs(float(x)))*(3.-abs(float(y)));vec2 at=(floor(uv*grid)*5.+vec2(float(x)+2.5,float(y)+2.5))/(grid*5.);c+=texture2D(taps,at)*weight;v+=weight;}vec4 concentration=c/max(v,.004);gl_FragColor=concentration/(1.+concentration);}`)
 const split=createProgram(gl,PAGED_VERTEX,common+`uniform sampler2D pigment,background,regionKeep;uniform float optical,massThreshold,compositionThreshold,hueThreshold,hueStrength;void main(){vec4 c=texture2D(color,localUV),b=texture2D(background,uv);b=b/max(1.-b,vec4(1./255.));vec3 excess=max(c.rgb-b.rgb,0.);float mass=max(c.a-b.a,0.)/max(c.a,.004);float composition=dot(excess,vec3(1.))/max(dot(c.rgb,vec3(1.)),.004);float q=clamp(max(mass,composition),0.,1.);float gate=max(smoothstep(massThreshold,massThreshold+.115,mass),smoothstep(compositionThreshold,compositionThreshold+.115,composition));q*=gate;float ownSum=dot(c.rgb,vec3(1.)),bgSum=dot(b.rgb,vec3(1.));float hueDistance=.5*dot(abs(c.rgb/max(ownSum,.004)-b.rgb/max(bgSum,.004)),vec3(1.));float colorShare=hueStrength*smoothstep(hueThreshold,hueThreshold+.185,hueDistance)*step(.004,ownSum)*step(.004,bgSum);q=max(q,colorShare);vec3 mobile=max(excess*gate,c.rgb*colorShare);float wet=smoothstep(0.,.03,V(uv));q*=wet;mobile*=wet;if(optical>1.5){gl_FragColor=vec4(q);return;}float retained=texture2D(regionKeep,uv).r;mobile*=retained/max(q,.004);q=retained;gl_FragColor=optical>.5?vec4(max(c.rgb-mobile,0.),c.a*(1.-q)):texture2D(pigment,localUV)*(1.-q);}`)
 type State={background:AccumulationBuffer;selection:AccumulationBuffer;keep:AccumulationBuffer;volume:boolean;parameters:ReturnType<ReadPuddleParameters>}
 let state:State|undefined
 const destroyState=(s:State)=>{s.background.destroy();s.selection.destroy();s.keep.destroy()}
 const run=(s:State,optical:number,out:AccumulationBuffer,p:AccumulationBuffer,c:AccumulationBuffer,w:AccumulationBuffer,rect?:MaterialRect)=>{
  draw.draw(split,out,{color:c,water:w,pigment:p,background:s.background,regionKeep:s.keep},rect,()=>{
   gl.uniform1f(gl.getUniformLocation(split,'volume'),s.volume?1:0);gl.uniform1f(gl.getUniformLocation(split,'optical'),optical)
   for(const [key,value]of Object.entries({massThreshold:.035,compositionThreshold:.035,hueThreshold:.035,hueStrength:.55}))gl.uniform1f(gl.getUniformLocation(split,key),s.parameters[key as keyof typeof s.parameters]??value)
  })
 }
 return {
  get selection(){if(!state)throw Error('Contrast not prepared');return state.keep},
  prepare(raw:PagedRawFields,volume:boolean){
   for(const f of Object.values(raw))if(f.width!==dimensions.width||f.height!==dimensions.height)throw Error('Contrast field dimensions differ')
   const resources:AccumulationBuffer[]=[]
   const alloc=(w:number,h:number,f:'nearest'|'linear')=>{const b=make(w,h,f);resources.push(b);return b}
   let next:State|undefined
   try{
    const background=alloc(low.width,low.height,'linear'),selection=alloc(low.width,low.height,'nearest'),keep=alloc(low.width,low.height,'nearest')
    const atlas=alloc(low.width*5,low.height*5,'nearest');atlas.writePixels(buildPagedTapAtlas(raw.c,low,[-48,-24,0,24,48]))
    draw.draw(bg,background,{taps:atlas},undefined,()=>{gl.uniform2f(gl.getUniformLocation(bg,'grid'),low.width,low.height);gl.uniform2f(gl.getUniformLocation(bg,'stride'),24/dimensions.width,24/dimensions.height)})
    const c=alloc(low.width,low.height,'nearest'),w=alloc(low.width,low.height,'nearest')
    c.writePixels(buildPagedTapAtlas(raw.c,low,[0]));w.writePixels(buildPagedTapAtlas(raw.water,low,[0]))
    next={background,selection,keep,volume,parameters:{...readParameters()}}
    run(next,2,selection,c,c,w)
    const minCells=Math.ceil((next.parameters.minimumRegionArea??128)/((dimensions.width/low.width)*(dimensions.height/low.height)))
    keep.writePixels(retainedComponents(selection.readPixels(),low.width,low.height,minCells))
    const previous=state;state=next
    if(previous)destroyState(previous)
   }finally{
    for(const b of resources)if(!state||![state.background,state.selection,state.keep].includes(b))b.destroy()
   }
  },
  renderReference(rect:MaterialRect,p:AccumulationBuffer,c:AccumulationBuffer,w:AccumulationBuffer,outP:AccumulationBuffer,outC:AccumulationBuffer){
   if(!state)throw Error('Contrast not prepared')
   for(const b of [p,c,w,outP,outC])if(b.width!==rect.width||b.height!==rect.height)throw Error('Contrast window dimensions differ')
   run(state,0,outP,p,c,w,rect);run(state,1,outC,p,c,w,rect)
  },
  destroy(){if(state)destroyState(state);state=undefined;draw.destroy();gl.deleteProgram(bg);gl.deleteProgram(split)}
 }
}
