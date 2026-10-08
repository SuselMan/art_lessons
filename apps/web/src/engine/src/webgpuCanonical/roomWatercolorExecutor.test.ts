import {describe,it,expect,vi} from 'vitest'
import {CanonicalRoomWatercolorExecutor,assertRoomNativeChunkIdentity} from './roomWatercolorExecutor'
describe('one native renderer identity across real engine routes',()=>{
 it('admits existing live, append and rebuild provenance through the same contract',()=>{
  for(const path of ['live','append','rebuild'] as const)expect(()=>assertRoomNativeChunkIdentity({path,layerId:'layer-a',generation:3,strokeId:'packed-source',ordinal:0},'layer-a',3)).not.toThrow()
 })
 it('rejects stale material generation and another layer before a native source write',()=>{
  const op={path:'append' as const,layerId:'layer-a',generation:3,strokeId:'packed-source',ordinal:0}
  expect(()=>assertRoomNativeChunkIdentity(op,'layer-a',4)).toThrow()
  expect(()=>assertRoomNativeChunkIdentity(op,'layer-b',3)).toThrow()
  expect(()=>assertRoomNativeChunkIdentity({...op,ordinal:-1},'layer-a',3)).toThrow()
 })
})

it('retirement releases owner-local resources even when shared GPU completion rejects',async()=>{
 const destroyed=vi.fn(),cancel=vi.fn(async()=>{}),gpuLost=new Error('GPU completion lost')
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor
 Object.assign(owner,{retired:false,retirement:null,central:{cancel},backend:{whenIdle:async()=>{throw gpuLost}},foreignAux:new Map(),adapter:{disposeCarryOracle:destroyed},planner:{destroyTextures:destroyed},scratch:{tiles:{destroy:destroyed}},target:{buffer:{destroy:destroyed}},fields:{destroy:destroyed},pool:{destroy:destroyed},bridge:{destroy:destroyed}})
 await expect(owner.retire('context-loss',false)).rejects.toBe(gpuLost)
 expect(cancel).not.toHaveBeenCalled();expect(destroyed).toHaveBeenCalledTimes(7)
})

it('DEV actual unsupported carrier publishes the unchanged source without transport or film rebase',async()=>{
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor
 const p=new Uint8Array([0,0,10,100]),c=new Uint8Array([11,0,0,10]),transport=vi.fn(()=>{throw Error('unsupported transport called')}),published=vi.fn(async()=>{}),reports:unknown[]=[]
 Object.assign(owner,{retired:false,pendingMoment:{chunk:{ordinal:3,segment:{rect:[0,0,1,1]},momentRecipe:{}}},target:{buffer:{height:1,width:1}},scratch:{tiles:{peek:()=>({inkLoad:{readBytes:async()=>p},inkColor:{readBytes:async()=>c},coverage:{}})}},momentSeam:{encodeAfterLanding:transport},momentReport:reports,publishWithoutDrain:published})
 const originalP=p.slice(),originalC=c.slice();await owner.publishCurrentToGl()
 expect(transport).not.toHaveBeenCalled();expect(published).toHaveBeenCalledOnce();expect(p).toEqual(originalP);expect(c).toEqual(originalC)
 expect(reports).toEqual([expect.objectContaining({ordinal:3,supported:false,violations:1,maxExcess:1,applied:false})])
})
it('DEV OFF publish never reads actual material or creates transport work',async()=>{
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor,published=vi.fn(async()=>{})
 Object.assign(owner,{pendingMoment:null,scratch:new Proxy({},{get(){throw Error('OFF source read')}}),publishWithoutDrain:published})
 await owner.publishCurrentToGl();expect(published).toHaveBeenCalledOnce()
})
