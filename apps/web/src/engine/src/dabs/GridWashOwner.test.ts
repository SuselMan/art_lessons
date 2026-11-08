import{it,expect,vi}from'vitest'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{RibbonStrokeScratch}from'../buffers/RibbonStrokeScratch'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import{GridWashOwner,GridWashBudget,GRID_WASH_ACTIVE_BYTES,type GridWashBinding,type GridBeginResult}from'./GridWashRuntime'
const binding:GridWashBinding={layerId:'l',userId:'u',strokeId:'s',targetGeneration:1,prefixKey:'p',begin:{kind:'canonical',firstOpId:'o',seq:1}}
it('failed BEGIN reservation makes no scratch/pool calls and leaves aggregate unchanged',()=>{
 const budget=new GridWashBudget(),held=budget.reserve(GRID_WASH_ACTIVE_BYTES)!,create=vi.fn()
 const view={binding,tiles:[],assertCurrent:vi.fn(),release:vi.fn()} satisfies Extract<GridBeginResult,{kind:'ready'}>['view']
 expect(GridWashOwner.capture({}as ILayerBuffer,binding,view,.5,budget,create)).toBeUndefined()
 expect(create).not.toHaveBeenCalled();expect(budget.bytes).toBe(GRID_WASH_ACTIVE_BYTES);held()
})
it('copy failure retires unpublished scratch and releases its entire claim',()=>{
 const budget=new GridWashBudget(),destroy=vi.fn(),copyError=Error('copy failed')
 const tile={buffer:{width:16,height:16}as AccumulationBuffer,originX:0,originY:0,contentRect:null}
 const scratch={getOrCreate(){throw copyError},destroy}as unknown as RibbonStrokeScratch
 const view={binding,tiles:[tile],assertCurrent:vi.fn(),release:vi.fn()}
 expect(()=>GridWashOwner.capture({}as ILayerBuffer,binding,view,.5,budget,()=>scratch)).toThrow(copyError)
 expect(destroy).toHaveBeenCalledOnce();expect(budget.bytes).toBe(0)
})
it('retire releases aggregate even when scratch destruction throws; second retire is idempotent',()=>{
 const budget=new GridWashBudget(),destroy=vi.fn(()=>{throw Error('destroy')})
 const view={binding,tiles:[],assertCurrent:vi.fn(),release:vi.fn()}
 const owner=GridWashOwner.capture({}as ILayerBuffer,binding,view,.5,budget,()=>({destroy}as unknown as RibbonStrokeScratch))!
 expect(budget.bytes).toBeGreaterThan(0);expect(()=>owner.retire()).toThrow('destroy')
 expect(budget.bytes).toBe(0);expect(()=>owner.retire()).not.toThrow();expect(destroy).toHaveBeenCalledOnce()
})

it('foreign boundary renews ONLY destination baseline and preserves immutable source membership',()=>{
 const budget=new GridWashBudget(),original={texture:{},copyRegionInto:vi.fn()},coverage={clear:vi.fn()},baseline={},entry={original,coverage,inkLoad:baseline}
 const buffer={width:16,height:16,copyTo:vi.fn()}as unknown as AccumulationBuffer
 const tile={buffer,originX:-16,originY:32,contentRect:null},scratch={getOrCreate:vi.fn(()=>entry),brushCeiling:vi.fn(),destroy:vi.fn()}as unknown as RibbonStrokeScratch
 const view={binding,tiles:[tile],assertCurrent:vi.fn(),release:vi.fn()}
 const owner=GridWashOwner.capture({}as ILayerBuffer,binding,view,.5,budget,()=>scratch)!
 owner.destinationEntry(tile);expect(buffer.copyTo).toHaveBeenCalledTimes(1)
 owner.destinationEntry(tile);expect(buffer.copyTo).toHaveBeenCalledTimes(1)
 owner.markDestinationBoundary();owner.destinationEntry(tile)
 expect(buffer.copyTo).toHaveBeenCalledTimes(2);expect(buffer.copyTo).toHaveBeenLastCalledWith(baseline)
 expect(coverage.clear).toHaveBeenCalledTimes(2)
 const destination={texture:{},width:512,height:512,clear:vi.fn()}as unknown as AccumulationBuffer
 owner.sampleTexel(-15.25,33.75,destination)
 expect(original.copyRegionInto).toHaveBeenLastCalledWith(destination,0,14,0,511,1,1)
 owner.sampleTexel(1000,1000,destination);expect(destination.clear).toHaveBeenCalledTimes(2);expect(original.copyRegionInto).toHaveBeenCalledTimes(1)
 expect(scratch.getOrCreate).toHaveBeenCalledTimes(1)
 owner.retire();expect(budget.bytes).toBe(0)
})
it('a later foreign-created destination never enters the immutable BEGIN source',()=>{
 const budget=new GridWashBudget(),coverage={clear:vi.fn()},entry={original:{texture:{},copyRegionInto:vi.fn()},coverage,inkLoad:{}}
 const scratch={getOrCreate:vi.fn(()=>entry),brushCeiling:vi.fn(),destroy:vi.fn()}as unknown as RibbonStrokeScratch
 const owner=GridWashOwner.capture({}as ILayerBuffer,binding,{binding,tiles:[],assertCurrent:vi.fn(),release:vi.fn()},.5,budget,()=>scratch)!
 const tile={buffer:{width:16,height:16,copyTo:vi.fn()}as unknown as AccumulationBuffer,originX:0,originY:0,contentRect:null}
 expect(owner.admitDestinations([tile],()=>({kind:'ready',lease:{assertCurrent(){},release(){}}}))).toEqual({kind:'ready'})
 owner.destinationEntry(tile);expect(tile.buffer.copyTo).toHaveBeenCalledWith(entry.inkLoad)
 const dest={texture:{},height:512,clear:vi.fn()}as unknown as AccumulationBuffer
 owner.sampleTexel(1,1,dest);expect(dest.clear).toHaveBeenCalledOnce();expect(entry.original.copyRegionInto).not.toHaveBeenCalled()
 owner.retire()
})

it('destructive same-target destination mutation releases stale pins without losing frozen originals',()=>{
 const budget=new GridWashBudget(),original={texture:{},copyRegionInto:vi.fn()},entry={original,coverage:{clear:vi.fn()},inkLoad:{}},destroy=vi.fn()
 const scratch={getOrCreate:vi.fn(()=>entry),brushCeiling:vi.fn(),destroy}as unknown as RibbonStrokeScratch
 const oldBuffer={width:16,height:16,copyTo:vi.fn()}as unknown as AccumulationBuffer,oldTile={buffer:oldBuffer,originX:0,originY:0,contentRect:null}
 const owner=GridWashOwner.capture({}as ILayerBuffer,binding,{binding,tiles:[oldTile],assertCurrent(){},release(){}},.5,budget,()=>scratch)!
 let stale=false;const release=vi.fn()
 owner.admitDestinations([oldTile],()=>({kind:'ready',lease:{assertCurrent(){if(stale)throw Error('old epoch')},release}}));owner.destinationEntry(oldTile)
 stale=true;expect(()=>owner.resetDestinations()).not.toThrow();expect(release).toHaveBeenCalledOnce()
 const newBuffer={width:16,height:16,copyTo:vi.fn()}as unknown as AccumulationBuffer,newTile={buffer:newBuffer,originX:0,originY:0,contentRect:null}
 expect(owner.admitDestinations([newTile],()=>({kind:'ready',lease:{assertCurrent(){},release(){}}}))).toEqual({kind:'ready'})
 owner.destinationEntry(newTile);expect(newBuffer.copyTo).toHaveBeenCalledWith(entry.inkLoad)
 expect(scratch.getOrCreate).toHaveBeenCalledTimes(1)
 const patch={texture:{},height:512,clear:vi.fn()}as unknown as AccumulationBuffer;owner.sampleTexel(2,2,patch)
 expect(original.copyRegionInto).toHaveBeenCalledWith(patch,2,13,0,511,1,1);owner.retire();expect(budget.bytes).toBe(0)
})

it('zero-delta repeated destination admission stores no additional budget claims',()=>{
 const budget=new GridWashBudget(),scratch={destroy:vi.fn()}as unknown as RibbonStrokeScratch
 const owner=GridWashOwner.capture({}as ILayerBuffer,binding,{binding,tiles:[],assertCurrent(){},release(){}},.5,budget,()=>scratch)!
 const claims=Reflect.get(owner,'claims')as unknown[];expect(claims).toHaveLength(1)
 for(let i=0;i<1000;i++)expect(owner.admitDestinations([],()=>{throw Error('No new pins')})).toEqual({kind:'ready'})
 expect(claims).toHaveLength(1);owner.retire();expect(budget.bytes).toBe(0)
})
