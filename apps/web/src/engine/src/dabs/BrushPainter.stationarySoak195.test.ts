import fs from'node:fs'
import{afterEach,describe,it,expect,vi}from'vitest'
import type{BrushLibrary,Dab}from'@grafetto/shared'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{BristleSoakGather139}from'../raster/BristleSoakGather139'
import{RibbonStrokeScratch}from'../buffers/RibbonStrokeScratch'
import{RibbonScratchPool}from'../buffers/RibbonScratchPool'
import{MockGL}from'../../testing/mockGL'
import type{ILayerBuffer,PaintTarget}from'../buffers/ILayerBuffer'
import type{CanonicalBeginRuntime}from'./CanonicalBeginRuntime'
import{bristleGeometryStamps}from'../presets/brushBristle'
const location=process.env.NATIVE195_SOAK_LIBRARY,library=location?JSON.parse(fs.readFileSync(location,'utf8'))as BrushLibrary:undefined
const runtime:CanonicalBeginRuntime={capability:'bristleSoak139',binding:{layerId:'ink',userId:'author',strokeId:'stroke',targetGeneration:1,prefixKey:'original-before-foreign',begin:{kind:'canonical',firstOpId:'initial',seq:2}}}
const execution={brushRandom:{version:1 as const,sequentialSeed:123,strokeSeed:456}}
const input=(size:number,x=10):Dab=>({x,y:10,size,pressure:size?1:0,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0,sourceTime:0,sourceAngle:0,sourceSize:4,sourceScale:size?1:0,sourceTwist:0,sourceTangentialPressure:.5,normalizedSpeed:0})
function fixture(){
 const brush=library!.brushes[0].descriptor,gl=new MockGL()as unknown as WebGLRenderingContext,pool=new RibbonScratchPool(gl),scratch=new RibbonStrokeScratch(pool,false,false),target={}as ILayerBuffer,leases:{buffer:{value:number};release:ReturnType<typeof vi.fn>}[]=[]
 const original={width:64,height:64,texture:{},value:7,copyTo:vi.fn((dest:{value:number})=>{dest.value=original.value})},view={binding:runtime.binding,tiles:[{buffer:original,originX:0,originY:0,contentRect:null}as unknown as PaintTarget],assertCurrent:vi.fn(),release:vi.fn()},unclaim=vi.fn()
 const ctx={openCanonicalBegin:vi.fn(()=>({kind:'ready' as const,view})),reserveCanonicalBeginSource:vi.fn(()=>unclaim),acquireSprayScratch:vi.fn((width:number,height:number)=>{const lease={buffer:{width,height,texture:{},value:0},assertCurrent:vi.fn(),release:vi.fn()};leases.push(lease);return lease}),canonicalResourcesReleased:vi.fn()}as unknown as BrushContext
 const gather=Object.create(BristleSoakGather139.prototype)as BristleSoakGather139;vi.spyOn(gather,'assertPrepared').mockImplementation(()=>{});const gathered=vi.spyOn(gather,'gather').mockImplementation((source,points)=>new Uint8Array(points.length*4).fill((source.tiles[0].buffer as unknown as{value:number}).value))
 const paint=vi.fn((_target:unknown,dabs:Dab[])=>{for(const d of dabs)bristleGeometryStamps(brush,d,scratch.brushBehavior!.bristle!,[0,0,0],1)})
 const painter=Object.assign(Object.create(BrushPainter.prototype),{ctx,soakGather:gather,behavior:{assertBristleSoakPrepared139:vi.fn(),paint}})as BrushPainter
 const initial=(d:Dab)=>painter.prepareBristleInitial195(target,d,'author','stroke',{brush,pressure:{size:true,opacity:true}},execution,runtime,scratch)
 return{brush,pool,scratch,target,original,view,ctx,leases,unclaim,gathered,painter,paint,initial,close:()=>{scratch.destroy();pool.destroy()}}
}
afterEach(()=>vi.restoreAllMocks())
describe.skipIf(!library)('genuine native195 Soak BEGIN retention',()=>{
 it('gathers a positive initial palette once without inventing a second request or snapshot',()=>{const f=fixture();try{expect(f.initial(input(4))).toEqual({kind:'ready'});expect(f.scratch.brushBehavior!.bristle!.ordinal).toBe(0);expect(f.scratch.brushBehavior!.bristle!.previous).toBeUndefined();expect(f.scratch.canonicalSource).toBeUndefined();expect(f.ctx.acquireSprayScratch).not.toHaveBeenCalled();f.original.value=99;expect(f.initial(input(4))).toEqual({kind:'ready'});expect(f.gathered).toHaveBeenCalledOnce();expect([...f.scratch.brushBehavior!.bristle!.soak!.rgba]).toEqual(Array(64).fill(7))}finally{f.close()}})
 it('keeps zero callbacks and captures a later anchor from the original frozen source, then releases it',()=>{const f=fixture();try{expect(f.initial(input(0))).toEqual({kind:'ready'});expect(f.ctx.reserveCanonicalBeginSource).toHaveBeenCalledWith(runtime.binding,16384);expect(f.original.copyTo).toHaveBeenCalledOnce();f.original.value=99
  const zero=[input(0),{...input(0,30),sourceTime:25,t:25}];f.painter.paint(f.target,zero,{opacity:1,hardness:1,sizeMultiplier:1}as never,{brush:f.brush,pressure:{size:true,opacity:true}},[0,0,0],f.scratch,undefined,execution,runtime)
  expect(f.paint.mock.calls[0][1]).toEqual(zero);expect(f.scratch.brushBehavior!.bristle!.previous).toEqual({x:30,y:10});expect(f.scratch.brushBehavior!.bristle!.ordinal).toBe(1)
  expect(f.initial({...input(4,35),sourceTime:50,t:50})).toEqual({kind:'ready'});expect(f.gathered.mock.calls[0][1][0].x).toBeGreaterThan(20);expect([...f.scratch.brushBehavior!.bristle!.soak!.rgba]).toEqual(Array(64).fill(7));expect(f.scratch.canonicalSource).toBeUndefined();expect(f.unclaim).toHaveBeenCalledOnce();expect(f.leases[0].release).toHaveBeenCalledOnce()
 }finally{f.close()}})
 it('releases pending139 on cancellation and rejects budget pressure before allocating/copying',()=>{const f=fixture();expect(f.initial(input(0))).toEqual({kind:'ready'});f.close();expect(f.unclaim).toHaveBeenCalledOnce();expect(f.leases[0].release).toHaveBeenCalledOnce();const g=fixture();try{vi.mocked(g.ctx.reserveCanonicalBeginSource!).mockReturnValue({kind:'notReady',reason:'resource',retryKey:'full'});expect(g.initial(input(0))).toMatchObject({kind:'notReady',reason:'resource'});expect(g.ctx.acquireSprayScratch).not.toHaveBeenCalled();expect(g.original.copyTo).not.toHaveBeenCalled();expect(g.scratch.canonicalSource).toBeUndefined()}finally{g.close()}})
})
