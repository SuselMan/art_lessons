import {describe,it,expect} from 'vitest'
import {observeSeedBridge,type SeedBridgeCost} from './seedBridgeCost'
import {canonicalTopRowsToGlRows} from './roomTileBridge'
describe('seed bridge cost boundaries',()=>{
 it('keeps exact hidden RGB and row orientation; ACK adds no new queue boundary',async()=>{
  const source=new Uint8Array([1,2,3,0,4,5,6,255]);const original=source.slice();const costs:SeedBridgeCost[]=[];let uploaded:Uint8Array|undefined;let idleCalls=0;let tick=0
  await observeSeedBridge(()=>source,b=>canonicalTopRowsToGlRows(b,1,2),b=>{uploaded=b},()=>{idleCalls++;return Promise.resolve()},c=>costs.push(c),()=>++tick)
  expect(source).toEqual(original);expect(uploaded).toEqual(new Uint8Array([4,5,6,255,1,2,3,0]));expect(idleCalls).toBe(1)
  expect(costs.map(c=>[c.phase,c.ok,c.bytes])).toEqual([['readPixels',true,0],['rowFlip',true,8],['uploadEnqueue',true,8],['queueAck',true,0]])
 })
 it('reports sync failure in finally without uploading or waiting',()=>{
  const costs:SeedBridgeCost[]=[];let calls=0
  expect(()=>observeSeedBridge(()=>{throw Error('read failed')},b=>b,()=>{calls++},()=>{calls++;return Promise.resolve()},c=>costs.push(c))).toThrow('read failed')
  expect(costs.map(c=>[c.phase,c.ok])).toEqual([['readPixels',false]]);expect(calls).toBe(0)
 })
 it('reports synchronous queue admission failure after upload',()=>{
  const costs:SeedBridgeCost[]=[]
  expect(()=>observeSeedBridge(()=>new Uint8Array(4),b=>b,()=>{},()=>{throw Error('queue lost')},c=>costs.push(c))).toThrow('queue lost')
  expect(costs.at(-1)?.phase).toBe('queueAck');expect(costs.at(-1)?.ok).toBe(false)
 })
 it('preserves queue rejection and ignores throwing diagnostic sinks',async()=>{
  const costs:SeedBridgeCost[]=[];const failure=Error('lost')
  await expect(observeSeedBridge(()=>new Uint8Array(4),b=>b,()=>{},()=>Promise.reject(failure),c=>{costs.push(c);throw Error('sink')})).rejects.toBe(failure)
  expect(costs.at(-1)?.phase).toBe('queueAck');expect(costs.at(-1)?.ok).toBe(false)
 })
})
