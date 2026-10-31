import {afterEach,expect,it,vi} from 'vitest'
import {createTestEngine} from './testing/engineTestUtils'
import type {ILayerBuffer} from './src/buffers/ILayerBuffer'
import type {TileRebuilder} from './src/buffers/TiledLayerBuffer'
import {snapshotContextStorage} from './src/buffers/ContextStorageOwner'

afterEach(()=>vi.restoreAllMocks())
type Internals={gl:WebGLRenderingContext;_makeLayerBuffer():ILayerBuffer;_makeTileRebuilder(id:string):TileRebuilder;_replayInto(layer:ILayerBuffer,...args:unknown[]):void}
const box={minX:0,minY:0,maxX:2,maxY:2}
it.each([false,true])('retires unpublished historical scratch after replay failure, preserving the original error (cleanup throws=%s)',cleanupThrows=>{
 const {engine}=createTestEngine({}, {width:4,height:4}),actual=engine as unknown as Internals
 const baseline=snapshotContextStorage(actual.gl).residentBytes,error=new Error('historical replay failed'),cleanup=new Error('scratch retirement failed')
 let destroy:ReturnType<typeof vi.spyOn>|undefined
 vi.spyOn(actual,'_replayInto').mockImplementation(layer=>{
  layer.resolveForPaint(box)
  const retire=layer.destroy.bind(layer)
  destroy=vi.spyOn(layer,'destroy').mockImplementation(()=>{retire();if(cleanupThrows)throw cleanup})
  throw error
 })
 try{
  expect(()=>actual._makeTileRebuilder('L')()).toThrow(error)
  expect(destroy).toHaveBeenCalledOnce()
  expect(snapshotContextStorage(actual.gl).residentBytes).toBe(baseline)
 }finally{vi.restoreAllMocks();engine.destroy()}
})
it('keeps successful historical scratch alive until the returned session owner retires it',()=>{
 const {engine}=createTestEngine({}, {width:4,height:4}),actual=engine as unknown as Internals
 const baseline=snapshotContextStorage(actual.gl).residentBytes
 vi.spyOn(actual,'_replayInto').mockImplementation(layer=>{layer.resolveForPaint(box)})
 try{
  const session=actual._makeTileRebuilder('L')()
  expect(snapshotContextStorage(actual.gl).residentBytes).toBeGreaterThan(baseline)
  expect(session.readPixels(box)).toHaveLength(64)
  session.destroy()
  expect(snapshotContextStorage(actual.gl).residentBytes).toBe(baseline)
 }finally{vi.restoreAllMocks();engine.destroy()}
})
