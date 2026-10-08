import {describe,it,expect} from 'vitest'
import {assertRoomNativeChunkIdentity} from './roomWatercolorExecutor'
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
