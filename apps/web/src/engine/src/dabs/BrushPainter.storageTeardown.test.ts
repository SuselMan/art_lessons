import { expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { ownedBrushFixture } from '../../testing/ownedBrushFixture'
import { snapshotContextStorage } from '../buffers/ContextStorageOwner'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'

it.each(['brush','smudge'] as const)('attempts real %s cache teardown even when its earlier owner cleanup throws',painter=>{
  const {engine}=createTestEngine({paper:'flat'}),gl=engine['gl'],primary=new Error('earlier owner cleanup')
  const owner=painter==='brush'?engine['_brush']:engine['_smudge']
  const cache=painter==='brush'?engine['_brush']['textures']:engine['_smudge']['wetTextures']
  const before=snapshotContextStorage(gl).residentBytes,resource=ownedBrushFixture(gl,12)
  cache.protect(['owned']);cache.putOwned('owned',resource)
  const early=painter==='brush'?vi.spyOn(engine['_brush']['behavior'],'destroy'):vi.spyOn(engine['_smudge']['scratchPool'],'destroy')
  early.mockImplementationOnce(()=>{throw primary})
  const deleted=vi.spyOn(gl,'deleteTexture')
  try {
    expect(()=>owner.destroy()).toThrow(primary)
    expect(deleted).toHaveBeenCalledWith(resource.texture)
    expect(cache.bytes).toBe(0)
    expect(snapshotContextStorage(gl).residentBytes).toBe(before)
  }finally{early.mockRestore();engine.destroy();deleted.mockRestore()}
  expect(snapshotContextStorage(gl).residentBytes).toBe(0)
})
it('keeps the original painter cleanup failure when migrated cache deletion also fails',()=>{
  const {engine}=createTestEngine({paper:'flat'}),gl=engine['gl'],primary=new Error('behavior primary'),brush=engine['_brush'],resource=ownedBrushFixture(gl,12)
  brush['textures'].protect(['owned']);brush['textures'].putOwned('owned',resource)
  const early=vi.spyOn(brush['behavior'],'destroy').mockImplementationOnce(()=>{throw primary})
  const original=gl.deleteTexture.bind(gl),deleted=vi.spyOn(gl,'deleteTexture').mockImplementation(texture=>{if(texture===resource.texture)throw new Error('delete secondary');original(texture)})
  try {
    expect(()=>brush.destroy()).toThrow(primary)
    expect(brush['textures'].bytes).toBe(0)
    expect(snapshotContextStorage(gl).orphanBytes).toBe(4) // VBO companion cleanup still succeeded
  }finally{
    early.mockRestore();deleted.mockRestore();gl.deleteTexture(resource.texture);engine.destroy();AccumulationBuffer.forgetContextStorage(gl)
  }
})
