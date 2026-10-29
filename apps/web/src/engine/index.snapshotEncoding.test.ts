import { expect, it, vi } from 'vitest'
import { PencilEngine } from './index'
import { createTestEngine } from './testing/engineTestUtils'

it('rejects typed cross-format tiles at the public boundary before snapshot or settle work',()=>{
  const {engine}=createTestEngine()
  try {
    engine.setBaseLayers(['L'])
    const snapshot=vi.spyOn((engine as any)._snapshotIO,'restore'),repair=vi.spyOn(engine as any,'_resolveSnapshotHistoryRepairs'),settle=vi.spyOn(engine as any,'_settleLayers')
    expect(()=>engine.restoreLayerFromSnapshot('L',[],5,'straight-rgba8')).toThrow('does not match the room')
    expect(()=>engine.restoreLayerFromSnapshot('L',[],5,'future' as never)).toThrow('does not match the room')
    expect(snapshot).not.toHaveBeenCalled();expect(repair).not.toHaveBeenCalled();expect(settle).not.toHaveBeenCalled()
    engine.restoreLayerFromSnapshot('L',[],5)
    expect(snapshot).toHaveBeenCalledWith('L',[],5,false,'premultiplied-rgba8')
  }finally{engine.destroy()}
})
it('also rejects legacy typed tiles against a future latched straight destination before reading mutable engine state',()=>{
  // The actual renderer still rejects constructing a straight room. Test the
  // public boundary independently without enabling that unsupported renderer.
  const context=new Proxy({rasterVersion:'straight-rgba8-v1'},{get(target,key){
    if(key==='rasterVersion')return target.rasterVersion
    throw Error('Mutable engine state touched before encoding admission')
  }})
  expect(()=>PencilEngine.prototype.restoreLayerFromSnapshot.call(context as unknown as PencilEngine,'L',[],5)).toThrow('does not match the room')
})
