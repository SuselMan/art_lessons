import{mask190RootExecution}from'../presets/independentMask190'
import{hasMyPaintTimer177Scope,isMyPaintDescriptor}from'../presets/stationary195Scopes'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{MYPAINT_SCHEMA}from'@grafetto/shared'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import type{BrushPressureSettings}from'../presets/digitalBrushPresets'
import{mypaintKernel,withMyPaintTiles}from'../presets/mypaintKernel'
import{assertSameBrushExecutionContext,assertBrushExecutionContext,assertBrushSourceInputs,type BrushExecutionContext}from'../presets/brushExecutionContext'
type Target=Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>&Partial<Pick<ILayerBuffer,'resolveExistingForPaint'|'resolveVisible'>>
type Mirror={pixels:Uint8Array;sources:{buffer:AccumulationBuffer;revision:number}[]}
type State={mirror:Map<string,Mirror>;handle:number;execution?:BrushExecutionContext;previous?:Dab;finished?:boolean;opacity:number;destroy():void}
type Tile={pointer:number;dirty:boolean;written:boolean;tx:number;ty:number}
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x))
/** Uses upstream brush dynamics AND tiled rasterizer. Q15 tile pages are
 * temporary within a paint call; canonical storage remains Grafetto's layers.
 * Quantize after every recorded input, independent of network batch sizes. */
export class MyPaintStrokePainter{
 private readonly states=new WeakMap<BehaviorScratch,State>()
 private readonly pool:number[]=[]
 destroy():void{if(!this.pool.length)return;const k=mypaintKernel();for(const p of this.pool)k.grafetto_free(p);this.pool.length=0}
 private create(scratch:BehaviorScratch,brush:BrushDescriptor,dab:Dab,color:[number,number,number],pressure:BrushPressureSettings,execution?:BrushExecutionContext):State{
  scratch.brushNative?.destroy()
  const k=mypaintKernel(),handle=k.grafetto_create(execution!.brushRandom!.strokeSeed)
  if(!handle)throw Error('MyPaint brush allocation failed')
  const state:State={mirror:new Map(),handle,execution,opacity:dab.opacity,destroy:()=>{if(state.handle){k.grafetto_destroy(state.handle);state.handle=0;state.mirror.clear()}}}
  try{
   k.grafetto_base(handle,0,state.opacity)
   for(const setting of brush.mypaint!.settings){
    const name=MYPAINT_SCHEMA.settings[setting.id].name,multiplier=name==='opaque'?state.opacity:1
    k.grafetto_base(handle,setting.id,setting.base*multiplier)
    for(const input of setting.inputs){
     const disabled=input.id===0&&(!pressure.size&&name==='radius_logarithmic'||!pressure.opacity&&(name==='opaque'||name==='opaque_multiply'))
     k.grafetto_mapping(handle,setting.id,input.id,disabled?0:input.points.length)
     if(!disabled)input.points.forEach((p,i)=>k.grafetto_point(handle,setting.id,input.id,i,p[0],p[1]*multiplier))
    }
   }
   if(!pressure.opacity)k.grafetto_mapping(handle,1,0,0)
   const max=Math.max(...color),min=Math.min(...color),delta=max-min,h=delta===0?0:max===color[0]?((color[1]-color[2])/delta+6)%6:max===color[1]?(color[2]-color[0])/delta+2:(color[0]-color[1])/delta+4
   for(const[name,value]of[['color_h',h/6],['color_s',max===0?0:delta/max],['color_v',max],['eraser',brush.mypaint!.erase?1:undefined]]as const){if(value!==undefined)k.grafetto_base(handle,MYPAINT_SCHEMA.settings.find(x=>x.name===name)!.id,value)}
   this.states.set(scratch,state);scratch.brushNative=state;return state
  }catch(e){state.destroy();throw e}
 }
 paint(target:Target,dabs:readonly Dab[],brush:BrushDescriptor,color:[number,number,number],pressure:BrushPressureSettings,scratch:BehaviorScratch,execution?:BrushExecutionContext,finish=false,endpoint?:Dab):void{
  if(brush.version===195)execution=mask190RootExecution(brush,execution)
  if(brush.version===177||brush.version===195){
   if(!hasMyPaintTimer177Scope(brush))throw Error('Invalid MyPaint timer177 policy')
   assertBrushExecutionContext(brush,execution);assertBrushSourceInputs(brush,dabs,endpoint)
   let previous=this.states.get(scratch)?.previous?.sourceTime??-Infinity
   for(const dab of endpoint?[...dabs,endpoint]:dabs){if(typeof dab.sourceTime!=='number'||!Number.isFinite(dab.sourceTime)||dab.sourceTime<0||dab.sourceTime<previous)throw Error('Invalid MyPaint177 recorded time');previous=dab.sourceTime}
  }
  if((brush.version===156||brush.mypaint?.surfacePolicy!==undefined)&&!isMyPaintDescriptor(brush as unknown as Record<string,unknown>))throw Error('Invalid Krita legacy MyPaint156 policy')
  let state=this.states.get(scratch);if(!state&&!dabs.length)return
  state??=this.create(scratch,brush,dabs[0],color,pressure,execution)
  assertSameBrushExecutionContext(state.execution,execution)
  if(state.finished){if(dabs.length)throw Error('MyPaint input already finished');return}
  const k=mypaintKernel(),tiles=new Map<string,Tile>();let used=0
  const request=(tx:number,ty:number,readonly:number):number=>{
   const key=tx+','+ty;let tile=tiles.get(key)
   if(!tile){
    if(used>=512)throw Error('MyPaint transaction exceeds tile budget')
    const pointer=this.pool[used]??(this.pool[used]=k.grafetto_alloc(64*64*12));used++
    if(!pointer)throw Error('MyPaint tile allocation failed')
    tile={pointer,dirty:false,written:false,tx,ty};tiles.set(key,tile)
    const rgba=new Uint8Array(k.memory.buffer,pointer+64*64*8,64*64*4)
    const rect={minX:tx*64,minY:ty*64,maxX:(tx+1)*64,maxY:(ty+1)*64}
    const existing=target.resolveExistingForPaint?.(rect)??target.resolveVisible?.(rect)??target.resolveForPaint(rect)
    const cached=state!.mirror.get(key)
    if(cached&&cached.sources.length===existing.length&&cached.sources.every((r,i)=>r.buffer===existing[i].buffer&&r.revision===r.buffer.contentRevision)){
     rgba.set(cached.pixels);k.grafetto_unpack(pointer)
    }else{
     // Fetch a256px neighbourhood once, rather than synchronizing the GPU
     // separately for every64px native page reached by a moving brush.
     const px=Math.floor(tx/4)*256,py=Math.floor(ty/4)*256,area={minX:px,minY:py,maxX:px+256,maxY:py+256},patch=new Uint8Array(256*256*4)
     const sources=target.resolveExistingForPaint?.(area)??target.resolveVisible?.(area)??target.resolveForPaint(area)
     for(const t of sources){
      const x=Math.max(px,t.originX),y=Math.max(py,t.originY),right=Math.min(px+256,t.originX+t.buffer.width),bottom=Math.min(py+256,t.originY+t.buffer.height),w=right-x,h=bottom-y;if(w<=0||h<=0)continue
      const bytes=t.buffer.readPixelsRegion(x-t.originX,t.buffer.height-(y-t.originY)-h,w,h)
      for(let row=0;row<h;row++)patch.set(bytes.subarray((h-1-row)*w*4,(h-row)*w*4),((y-py+row)*256+x-px)*4)
     }
     for(let cy=0;cy<4;cy++)for(let cx=0;cx<4;cx++){
      const cellX=px+cx*64,cellY=py+cy*64,cellKey=cellX/64+','+cellY/64
      if(cellKey!==key&&tiles.has(cellKey))continue
      const bytes=new Uint8Array(64*64*4)
      for(let row=0;row<64;row++)bytes.set(patch.subarray(((cy*64+row)*256+cx*64)*4,((cy*64+row)*256+cx*64+64)*4),row*64*4)
      const refs=sources.filter(t=>t.originX<cellX+64&&t.originX+t.buffer.width>cellX&&t.originY<cellY+64&&t.originY+t.buffer.height>cellY)
      state!.mirror.set(cellKey,{pixels:bytes,sources:refs.map(t=>({buffer:t.buffer,revision:t.buffer.contentRevision}))})
     }
     const cached=state!.mirror.get(key)!
     rgba.set(cached.pixels);k.grafetto_unpack(pointer)
    }
   }
   if(!readonly){tile.dirty=true;tile.written=true}return tile.pointer
  }
  const quantize=()=>{for(const t of tiles.values())if(t.dirty){k.grafetto_quantize(t.pointer);t.dirty=false}}
  const apply=(dab:Dab,final=false)=>{
   const previous=state!.previous,dt=previous?Math.max(0,dab.sourceTime!-previous.sourceTime!)/1000:.015
   k.grafetto_base(state!.handle,3,Math.log(Math.max(.2,dab.size/2)))
   k.grafetto_begin(state!.handle)
   try{
    if(!previous)k.grafetto_stroke(state!.handle,dab.x,dab.y,dab.pressure,clamp(dab.tiltX/60,-1,1),clamp(dab.tiltY/60,-1,1),1)
    k.grafetto_stroke(state!.handle,dab.x,dab.y,final?0:dab.pressure,clamp(dab.tiltX/60,-1,1),clamp(dab.tiltY/60,-1,1),dt)
   }finally{k.grafetto_end(state!.handle)}
   state!.previous={...dab};quantize()
  }
  withMyPaintTiles(request,()=>{
   for(const dab of dabs)apply(dab)
   if(finish){const last=endpoint??state!.previous;if(last)apply({...last,sourceTime:endpoint?.sourceTime??last.sourceTime!+15},true);state!.finished=true}
  })
  const changed=new Map<AccumulationBuffer,number>()
  for(const t of tiles.values())if(t.written){
   const rect={minX:t.tx*64,minY:t.ty*64,maxX:(t.tx+1)*64,maxY:(t.ty+1)*64},pixels=new Uint8Array(k.memory.buffer,t.pointer+64*64*8,64*64*4)
   for(const dst of target.resolveForPaint(rect)){
    const x=Math.max(rect.minX,dst.originX),y=Math.max(rect.minY,dst.originY),right=Math.min(rect.maxX,dst.originX+dst.buffer.width),bottom=Math.min(rect.maxY,dst.originY+dst.buffer.height),w=right-x,h=bottom-y;if(w<=0||h<=0)continue
    const bytes=new Uint8Array(w*h*4)
    for(let row=0;row<h;row++)for(let column=0;column<w;column++)for(let c=0;c<4;c++)bytes[((h-1-row)*w+column)*4+c]=pixels[((y-rect.minY+row)*64+x-rect.minX+column)*4+c]
    if(!changed.has(dst.buffer))changed.set(dst.buffer,dst.buffer.contentRevision)
    dst.buffer.writePixelsRegion(x-dst.originX,dst.buffer.height-(y-dst.originY)-h,w,h,bytes)
   }
   target.markContentPainted(rect)
  }
  // Only our own disjoint64px uploads may advance a previously valid mirror.
  // A foreign write leaves its old revision intact, forcing a GPU refresh.
  for(const cached of state.mirror.values())for(const ref of cached.sources)if(ref.revision===changed.get(ref.buffer))ref.revision=ref.buffer.contentRevision
  for(const [key,t]of tiles)if(t.written){
   const pixels=new Uint8Array(k.memory.buffer,t.pointer+64*64*8,64*64*4),bytes=new Uint8Array(pixels)
   const rect={minX:t.tx*64,minY:t.ty*64,maxX:(t.tx+1)*64,maxY:(t.ty+1)*64},sources=target.resolveExistingForPaint?.(rect)??target.resolveVisible?.(rect)??target.resolveForPaint(rect)
   state.mirror.delete(key);state.mirror.set(key,{pixels:bytes,sources:sources.map(t=>({buffer:t.buffer,revision:t.buffer.contentRevision}))})
  }
  while(state.mirror.size>128)state.mirror.delete(state.mirror.keys().next().value!)
 }
}
