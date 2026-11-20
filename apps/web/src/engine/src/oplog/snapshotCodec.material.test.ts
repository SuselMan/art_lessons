import {describe,it,expect} from 'vitest'
import {encodeLayerTiles,decodeLayerTiles,type SnapshotTile} from './snapshotCodec'
import {retileSnapshotTiles} from '../buffers/retileSnapshot'
const plane=(n:number)=>new Uint8Array(32).fill(n)
const tile=():SnapshotTile=>({originX:-2,originY:0,width:2,height:4,pixels:plane(255),colorSmudge:{color:plane(77),height:plane(128)}})
describe('material snapshot framing',()=>{
 it('retains independent colour and height through nonzero-offset transport views',()=>{
  const t=tile(),bytes=encodeLayerTiles([t]),buffer=new Uint8Array(bytes.length+7);buffer.set(bytes,7)
  const decoded=decodeLayerTiles(buffer.subarray(3),4)
  expect(decoded.nextOffset).toBe(bytes.length+4)
  expect(decoded.tiles).toEqual([t])
  expect(decoded.tiles[0].colorSmudge!.color.buffer).toBe(buffer.buffer)
 })
 it('keeps dry tiles dry in a mixed layer',()=>{
  const dry={...tile(),colorSmudge:undefined,originX:0}
  expect(decodeLayerTiles(encodeLayerTiles([tile(),dry]),0).tiles[1].colorSmudge).toBeUndefined()
 })
 it('leaves the ordinary legacy bytes unchanged',()=>{
  const bytes=encodeLayerTiles([{originX:0,originY:0,width:1,height:1,pixels:new Uint8Array([1,2,3,4])}])
  expect([...bytes]).toEqual([1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,2,3,4])
 })
 it('rejects missing planes and truncated payloads instead of flattening',()=>{
  const t=tile();t.colorSmudge!.height=new Uint8Array(1)
  expect(()=>encodeLayerTiles([t])).toThrow('Incomplete')
  const raw=encodeLayerTiles([tile()])
  for(let length=0;length<raw.length;length++)expect(()=>decodeLayerTiles(raw.subarray(0,length),0)).toThrow()
 })
 it('rejects unknown versions and flags',()=>{
  for(const offset of [4,12]){
   const raw=encodeLayerTiles([tile()]);new DataView(raw.buffer).setUint32(offset,7,true)
   expect(()=>decodeLayerTiles(raw,0)).toThrow('Unknown')
  }
 })
 it('retains asymmetric material rows when splitting into a smaller grid',()=>{
  const t=tile();t.colorSmudge!.color=Uint8Array.from({length:32},(_,i)=>i)
  const pieces=retileSnapshotTiles([t],2,2)
  expect(pieces).toHaveLength(2)
  expect(pieces.find(p=>p.originY===0)!.colorSmudge!.color).toEqual(t.colorSmudge!.color.subarray(16))
  expect(pieces.find(p=>p.originY===2)!.colorSmudge!.color).toEqual(t.colorSmudge!.color.subarray(0,16))
  expect(pieces.every(p=>p.colorSmudge!.height.every(v=>v===128))).toBe(true)
 })
 it('starts dry fragments from their projected colour when merging with wet material',()=>{
  const wet:SnapshotTile={originX:0,originY:0,width:1,height:1,pixels:new Uint8Array([9,9,9,255]),colorSmudge:{color:new Uint8Array([3,3,3,255]),height:new Uint8Array([128,128,128,255])}}
  const dry:SnapshotTile={originX:1,originY:0,width:1,height:1,pixels:new Uint8Array([5,5,5,255])}
  for(const sources of [[wet,dry],[dry,wet]]){
   const merged=retileSnapshotTiles(sources,2,1)[0]
   expect([...merged.colorSmudge!.color]).toEqual([3,3,3,255,5,5,5,255])
   expect([...merged.colorSmudge!.height]).toEqual([128,128,128,255,0,0,0,0])
  }
 })
})
