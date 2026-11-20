import {describe,it,expect} from 'vitest'
import {createTestEngine,makeLayerAdd,checkpointBytes} from './testing/engineTestUtils'
import {decodeLayerTiles,type SnapshotTile} from './src/oplog/snapshotCodec'
const materialTile=():SnapshotTile=>({originX:0,originY:0,width:8,height:8,pixels:new Uint8Array(256).fill(60),colorSmudge:{color:new Uint8Array(256).fill(90),height:new Uint8Array(256).fill(120)}})
describe('material state through engine snapshots and undo',()=>{
 it('restores, rebakes and retains both independent fields in the pinned checkpoint',()=>{
  const {engine}=createTestEngine({userId:'A'},{width:8,height:8})
  engine.appendOperation(makeLayerAdd('A','L'),'remote')
  const tile=materialTile();engine.restoreLayerFromSnapshot('L',[tile])
  expect(decodeLayerTiles(engine.bakeNetworkSnapshot('L')!,0).tiles).toEqual([tile])
  expect(checkpointBytes(engine)).toBeGreaterThan(256)
  engine.appendOperation({id:'clear-material',type:'layer_clear',userId:'A',timestamp:1,layerId:'L'},'remote')
  expect(engine.bakeNetworkSnapshot('L')).toBeNull()
  engine.undo()
  expect(decodeLayerTiles(engine.bakeNetworkSnapshot('L')!,0).tiles).toEqual([tile])
  engine.destroy()
 })
 it('retains height even when the projected layer is currently transparent',()=>{
  const {engine}=createTestEngine({userId:'A'},{width:8,height:8});engine.initLayer('L')
  const tile=materialTile();tile.pixels.fill(0);tile.colorSmudge!.color.fill(0)
  engine.restoreLayerFromSnapshot('L',[tile])
  expect(decodeLayerTiles(engine.bakeNetworkSnapshot('L')!,0).tiles).toEqual([tile])
  engine.destroy()
 })
})
