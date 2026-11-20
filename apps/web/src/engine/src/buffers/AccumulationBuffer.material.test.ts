import {describe,it,expect} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {TiledLayerBuffer,type TileRebuilder} from './TiledLayerBuffer'
import {isEmptySnapshotTile} from './retileSnapshot'
const makeGL=()=>new MockGL() as unknown as WebGLRenderingContext
const plane=(value:number)=>new Uint8Array(8*8*4).fill(value)
describe('tile-owned colour smudge fields',()=>{
 it('is lazy, starts from the projection and releases both fields on clear',()=>{
  const b=new AccumulationBuffer(makeGL(),8,8);const changes:number[]=[];b.onMaterialStorageChange=n=>changes.push(n)
  b.restorePixels(plane(90));expect(b.baseBytes).toBe(256);expect(b.colorSmudge).toBeUndefined()
  const state=b.ensureColorSmudge();expect(state.color.readPixels()).toEqual(plane(90));expect(state.height.readPixels()).toEqual(plane(0))
  expect(b.ensureColorSmudge()).toBe(state);expect(b.baseBytes).toBe(768)
  b.clear();expect(b.colorSmudge).toBeUndefined();expect(changes).toEqual([2,-2]);expect(b.baseBytes).toBe(256)
 })
 it('restores clipped world-top material rows exactly like the projection',()=>{
  const b=new AccumulationBuffer(makeGL(),8,8);b.clear()
  b.restoreColorSmudgePixels(8,3,{color:new Uint8Array(96).fill(40),height:new Uint8Array(96).fill(80)})
  // MockGL readPixels ignores the region origin; inspect the full texture.
  expect(b.colorSmudge!.color.readPixels().subarray(160)).toEqual(new Uint8Array(96).fill(40))
  expect(b.colorSmudge!.height.readPixels().subarray(160)).toEqual(new Uint8Array(96).fill(80))
  expect(b.colorSmudge!.height.readPixels().subarray(0,160)).toEqual(new Uint8Array(160))
 })
 it('rejects incomplete restore without destroying existing state',()=>{
  const b=new AccumulationBuffer(makeGL(),8,8),state=b.ensureColorSmudge()
  expect(()=>b.restoreColorSmudgePixels(8,8,{color:plane(1),height:new Uint8Array(1)})).toThrow()
  expect(b.colorSmudge).toBe(state)
 })
 it('counts both extra fields against eviction and recovers their content',()=>{
  const rebuild:TileRebuilder=()=>({readPixels:()=>plane(30),readColorSmudgePixels:()=>({color:plane(50),height:plane(70)}),destroy:()=>{}})
  const layer=new TiledLayerBuffer(makeGL(),8,8,rebuild,8*256)
  for(let x=0;x<4;x++)layer.resolveForPaint({minX:x*8,minY:0,maxX:x*8+8,maxY:8})[0].buffer.ensureColorSmudge()
  layer.resolveVisible({minX:24,minY:0,maxX:32,maxY:8})
  expect(layer.evictedTileCount).toBeGreaterThan(0)
  const recovered=layer.resolveVisible({minX:0,minY:0,maxX:8,maxY:8})[0].buffer
  expect(recovered.readColorSmudgePixels()).toEqual({color:plane(50),height:plane(70)})
  layer.destroy()
 })
 it('preserves invisible height rather than treating the tile as disposable',()=>{
  const t={originX:0,originY:0,width:8,height:8,pixels:plane(0),colorSmudge:{color:plane(0),height:plane(70)}}
  expect(isEmptySnapshotTile(t)).toBe(false)
 })
})
