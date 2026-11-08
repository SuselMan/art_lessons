import{it,expect,vi}from'vitest'
import{SmudgePainter}from'./SmudgePainter'
import{TiledLayerBuffer}from'../buffers/TiledLayerBuffer'
import{GridWashBudget}from'./GridWashRuntime'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{grid137,dab137}from'../../../../../../packages/shared/src/gridWash137.testFixture.js'
import{brushExecutionContext}from'../presets/brushExecutionContext'
import type{MixerPaint}from'../presets/digitalBrushPresets'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{GridWashRuntime,GridWashBinding}from'./GridWashRuntime'
const paint=():MixerPaint=>({brush:grid137(),color:[1,0,0],load:0,pickup:1,strength:1,pressure:false,sizeMultiplier:1,curve:[[0,1],[1,1]]})
const runtime:GridWashRuntime={binding:{layerId:'l',userId:'u',strokeId:'s',targetGeneration:1,prefixKey:'p',begin:{kind:'canonical',seq:1,firstOpId:'op'}}}
it('actual facade cannot fall back to current target without verified BEGIN authority',()=>{
 const painter=Object.create(SmudgePainter.prototype)as SmudgePainter,touch=vi.fn()
 Object.defineProperty(painter,'ctx',{get(){touch();throw Error('context')}})
 const target=new Proxy({},{get(){touch();throw Error('target')}})as ILayerBuffer
 expect(painter.paint(target,[dab137()],'u',undefined,'s',paint(),brushExecutionContext({version:1,sequentialSeed:7,strokeSeed:4}))).toEqual({kind:'notReady',reason:'prefix',retryKey:'missing-host:prefix',acceptedDabs:0})
 expect(touch).not.toHaveBeenCalled()
})
it('zero-only input advances returned cursor but does not access resource/state owners',()=>{
 const painter=Object.create(SmudgePainter.prototype)as SmudgePainter,touch=vi.fn()
 for(const name of['ctx','wetGestures','gridBatch'])Object.defineProperty(painter,name,{get(){touch();throw Error(name)}})
 expect(painter.paint({}as ILayerBuffer,[{...dab137(),size:0},{...dab137(),size:0}],'u',undefined,'s',paint(),brushExecutionContext({version:1,sequentialSeed:7,strokeSeed:4}),runtime)).toEqual({kind:'painted',acceptedDabs:2})
 expect(touch).not.toHaveBeenCalled()
})
it('stroke identity mismatch rejects before resource or mutable state access',()=>{
 const painter=Object.create(SmudgePainter.prototype)as SmudgePainter,touch=vi.fn()
 Object.defineProperty(painter,'ctx',{get(){touch();throw Error('ctx')}})
 expect(()=>painter.paint({}as ILayerBuffer,[dab137()],'u',undefined,'other',paint(),brushExecutionContext({version:1,sequentialSeed:7,strokeSeed:4}),runtime)).toThrow('identity')
 expect(touch).not.toHaveBeenCalled()
})

function orderingFixture(failBorrow=false){
 const p=Object.create(SmudgePainter.prototype)as SmudgePainter,map=new Map(),budget=new GridWashBudget(),events:string[]=[],destroy=vi.fn();let held=0
 const target=Object.assign(Object.create(TiledLayerBuffer.prototype),{coarseWorldSize:()=>({w:512,h:512}),resolveForPaint:()=>{expect(held).toBe(0);events.push('resolve');return[]},markContentPainted:vi.fn()})as TiledLayerBuffer
 const ctx={assertGridWashPrepared(){expect(held).toBe(0);events.push('check')},openGridBegin(_target:ILayerBuffer,openedBinding:GridWashBinding){expect(held).toBe(0);events.push('open');return{kind:'ready',view:{binding:openedBinding,tiles:[],assertCurrent(){expect(held).toBe(0)},release(){events.push('view-release')}}}},pinGridDestinations(){throw Error('No physical targets')},createBrushScratch:()=>({destroy}),borrowRequestWash(){events.push('borrow');if(failBorrow)throw Error('borrow-failed');held++;return{kernel:{assertPrepared(){},captureCurrent:()=>()=>{},transfer(){throw Error('No physical targets')}},present(){throw Error('No physical targets')},release(){held--;events.push('release')}}}}
 Reflect.set(p,'ctx',ctx);Reflect.set(p,'wetGestures',map);Reflect.set(p,'imprints',new Map());Reflect.set(p,'replayChunks',new Map());Reflect.set(p,'gridBudget',budget);Reflect.set(p,'gridBatch',{assertPrepared(){}})
 Reflect.set(p,'acquireScratch',()=>({width:512,height:512,texture:{},clear(){}}as AccumulationBuffer));Reflect.set(p,'releaseScratch',()=>{})
 return{p,target,map,budget,events,destroy,get held(){return held}}
}
it('actual prepare/paint permit nested recovery before strict lease and release every request',()=>{
 const f=orderingFixture(),execution=brushExecutionContext({version:1,strokeSeed:4,sequentialSeed:7})
 const r=f.p.paint(f.target,[dab137(),{...dab137(),size:0},dab137()],'u',undefined,'s',paint(),execution,runtime)
 // Use same owner user in binding and preparation.
 expect(r).toEqual({kind:'painted',acceptedDabs:3});expect(f.held).toBe(0)
 expect(f.events.indexOf('view-release')).toBeLessThan(f.events.indexOf('resolve'))
 expect(f.events.indexOf('resolve')).toBeLessThan(f.events.indexOf('borrow'))
 expect(f.events.filter(x=>x==='borrow')).toHaveLength(3)
})
it('actual first borrow failure leaves capture unpublished and releases all aggregate claims',()=>{
 const f=orderingFixture(true),execution=brushExecutionContext({version:1,strokeSeed:4,sequentialSeed:7})
 expect(()=>f.p.prepareGridGesture(f.target,dab137(),'u',paint(),execution,runtime)).toThrow('borrow-failed')
 expect(f.map.size).toBe(0);expect(f.budget.bytes).toBe(0);expect(f.destroy).toHaveBeenCalledOnce();expect(f.held).toBe(0)
})

it('same user Grid owners on two layers/target generations coexist; exact END retires only matching identity',()=>{
 const f=orderingFixture(),execution=brushExecutionContext({version:1,strokeSeed:4,sequentialSeed:7}),d={...dab137(),x:30,y:30}
 const second=Object.assign(Object.create(TiledLayerBuffer.prototype),{coarseWorldSize:()=>({w:512,h:512}),resolveForPaint:()=>[],markContentPainted:vi.fn()})as TiledLayerBuffer
 const other:GridWashRuntime={binding:{...runtime.binding,layerId:'other-layer',strokeId:'other-stroke',targetGeneration:2}}
 expect(f.p.prepareGridGesture(f.target,d,'u',paint(),execution,runtime)).toEqual({kind:'ready'})
 expect(f.p.prepareGridGesture(second,d,'u',paint(),execution,other)).toEqual({kind:'ready'})
 expect(f.p.activeGridOwners()).toHaveLength(2);expect(f.p.hasGridBinding(f.target,runtime.binding)).toBe(true);expect(f.p.hasGridBinding(second,other.binding)).toBe(true)
 const bytes=f.budget.bytes;f.p.finishGesture('u',null);f.p.finishGesture('u','stale')
 expect(f.budget.bytes).toBe(bytes);expect(f.p.activeGridOwners()).toHaveLength(2)
 f.p.finishGesture('u','s');expect(f.p.hasGridBinding(f.target,runtime.binding)).toBe(false);expect(f.p.hasGridBinding(second,other.binding)).toBe(true)
 expect(f.p.activeGridOwners()).toHaveLength(1);expect(f.budget.bytes).toBeLessThan(bytes)
 f.p.releaseGesture('u','other-stroke',false);expect(f.p.activeGridOwners()).toHaveLength(0);expect(f.budget.bytes).toBe(0)
})
