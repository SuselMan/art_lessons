import{describe,it,expect}from'vitest'
import type{Dab}from'@grafetto/shared'
import{GridWashBudget,GRID_WASH_ACTIVE_BYTES,gridBindingKey,gridGestureKey137,gridDestinationPlan,isGridRenderableDab137,gridGeometryNotReady,type GridWashBinding}from'./GridWashRuntime'
const binding:GridWashBinding={layerId:'layer',userId:'a',strokeId:'stroke',targetGeneration:1,prefixKey:'prefix',begin:{kind:'canonical',firstOpId:'op',seq:3}}
describe('Grid137 admission authority and aggregate',()=>{
 it('positive oversized input remains renderable, zero and nonfinite never begin',()=>{
  for(const size of[1,1e30])expect(isGridRenderableDab137({size}as Dab)).toBe(true)
  for(const size of[0,-1,NaN,Infinity])expect(isGridRenderableDab137({size}as Dab)).toBe(false)
  expect(gridGeometryNotReady(binding)).toEqual({kind:'notReady',reason:'resource',retryKey:'prefix:geometry-limit',detail:'geometry'})
 })
 it('one aggregate remains charged while an isolated owner borrows another map',()=>{
  const aggregate=new GridWashBudget(),live=aggregate.reserve(12*1024*1024)!
  expect(aggregate.reserve(5*1024*1024)).toBeUndefined()
  const isolated=aggregate.reserve(4*1024*1024)!
  expect(aggregate.bytes).toBe(GRID_WASH_ACTIVE_BYTES)
  isolated();isolated();expect(aggregate.bytes).toBe(12*1024*1024)
  live();expect(aggregate.bytes).toBe(0)
 })
 it('world plans retain negative origins and reject oversized metadata before allocation',()=>{
  expect(gridDestinationPlan({minX:-1,minY:-1,maxX:1,maxY:1},{w:512,h:512})).toEqual([
   {originX:-512,originY:-512,width:512,height:512},{originX:0,originY:-512,width:512,height:512},
   {originX:-512,originY:0,width:512,height:512},{originX:0,originY:0,width:512,height:512}])
  expect(gridDestinationPlan({minX:0,minY:0,maxX:1e20,maxY:1e20},{w:512,h:512})).toBeUndefined()
 })
 it('binding identity is semantic and distinguishes prefix and target generation',()=>{
  const reordered={...binding,begin:{seq:3,firstOpId:'op',kind:'canonical' as const}}
  expect(gridBindingKey(reordered)).toBe(gridBindingKey(binding))
  expect(gridBindingKey({...binding,targetGeneration:2})).not.toBe(gridBindingKey(binding))
  expect(gridBindingKey({...binding,prefixKey:'late'})).not.toBe(gridBindingKey(binding))
 })
})

it('Grid map identity includes layer/stroke/source generation while prefix revision remains a binding check',()=>{
 expect(gridGestureKey137(binding)).not.toBe(gridGestureKey137({...binding,layerId:'other'}))
 expect(gridGestureKey137(binding)).not.toBe(gridGestureKey137({...binding,targetGeneration:2}))
 expect(gridGestureKey137(binding)).not.toBe(gridGestureKey137({...binding,strokeId:'new'}))
 expect(gridGestureKey137(binding)).toBe(gridGestureKey137({...binding,prefixKey:'new-prefix'}))
 expect(gridBindingKey(binding)).not.toBe(gridBindingKey({...binding,prefixKey:'new-prefix'}))
})
