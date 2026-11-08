import{it,expect,vi}from'vitest'
import{SprayRequestPainter}from'./SprayRequestPainter'
import{SpraySourceAtlas}from'./SpraySourceAtlas'
import{SpraySourceBatch}from'./SpraySourceBatch'
import{spray133,dab133}from'../../../../../../packages/shared/src/sprayWash133.testFixture'
import{MockGL}from'../../testing/mockGL'
import{TiledLayerBuffer}from'../buffers/TiledLayerBuffer'
import{beginBrushBehavior}from'../presets/brushBehavior'
import type{BrushContext}from'./BrushPainter'
import type{CanonicalBeginSource}from'./CanonicalBeginSource'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
it('canonical146 resolves all request colours only through frozen BEGIN; old76 uses current layer',()=>{
 const gl=new MockGL()as unknown as WebGLRenderingContext,resolve=vi.fn(()=>[]),current=vi.fn(),release=vi.fn(),b=spray133();b.version=146;b.behavior!.rendering!.accumulation='directOver';Object.assign(b.spray!.color,{sampleInput:true,sourcePolicy:'canonical-begin-v1'});b.spray!.particle.width=b.spray!.particle.height=1
 const buf=()=>({width:8,height:8,texture:{},clear:vi.fn(),beginDraw:vi.fn(),endDraw:vi.fn()})as unknown as AccumulationBuffer
 const target=Object.assign(Object.create(TiledLayerBuffer.prototype),{coarseWorldSize:()=>({w:8,h:8}),resolveVisible:vi.fn(()=>[]),resolveForPaint:vi.fn(()=>[]),markContentPainted:vi.fn()})as TiledLayerBuffer
 const source={target,capability:'spray146',resolveForRead:resolve,assertCurrent:current}as unknown as CanonicalBeginSource
 const painter=new SprayRequestPainter({gl,segmentLength:()=>1,paper:{texture:{}}}as unknown as BrushContext,()=>({buffer:buf(),assertCurrent(){},release}),()=>{throw Error('image')},()=>undefined)
 const collect=vi.spyOn(SpraySourceAtlas.prototype,'collect').mockImplementation((_points,owner)=>{owner.resolveCells({minX:0,minY:0,maxX:8,maxY:8});return undefined}),draw=vi.spyOn(SpraySourceBatch.prototype,'paint').mockImplementation(()=>{})
 try{
  painter.prepare()
  painter.paint(target,[dab133(),dab133(4,10)],b,beginBrushBehavior(dab133()),[1,0,0],{size:false,opacity:false},1,undefined,source)
  expect(resolve).toHaveBeenCalledTimes(2);expect(target.resolveVisible).not.toHaveBeenCalled();expect(collect).toHaveBeenCalledTimes(2);expect(release).toHaveBeenCalledTimes(2)
  const old=structuredClone(b);old.version=76;delete old.spray!.color.sourcePolicy;painter.paint(target,[dab133()],old,beginBrushBehavior(dab133()),[1,0,0],{size:false,opacity:false},1)
  expect(target.resolveVisible).toHaveBeenCalledTimes(1)
  expect(()=>painter.paint(target,[dab133()],b,beginBrushBehavior(dab133()),[1,0,0],{size:false,opacity:false},1)).toThrow('frozen source')
 }finally{collect.mockRestore();draw.mockRestore();painter.destroy()}
})
