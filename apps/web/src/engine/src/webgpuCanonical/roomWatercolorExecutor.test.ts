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
