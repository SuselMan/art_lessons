import {describe,it,expect} from 'vitest'
import {canonicalTopRowsToGlRows} from './roomTileBridge'
describe('actual Room tile row contract',()=>{
 it('preserves every Q8 byte and hidden alpha-zero color with one orientation change',()=>{
  const a=new Uint8Array([255,3,17,0,11,20,9,32,1,2,3,255,7,8,9,128])
  expect([...canonicalTopRowsToGlRows(a,2,2)]).toEqual([...a.slice(8),...a.slice(0,8)])
  expect(canonicalTopRowsToGlRows(canonicalTopRowsToGlRows(a,2,2),2,2)).toEqual(a)
 })
 it('rejects partial or fractional tiles before changing a layer',()=>{
  expect(()=>canonicalTopRowsToGlRows(new Uint8Array(3),1,1)).toThrow()
  expect(()=>canonicalTopRowsToGlRows(new Uint8Array(4),.5,2)).toThrow()
 })
})

describe('canvas publication diagnostic isolation',()=>{
 it('preserves original submit/ACK/import and observer exceptions',async()=>{
  const {CanonicalRoomTileBridge}=await import('./roomTileBridge'),events:string[]=[]
  const bridge=Object.create(CanonicalRoomTileBridge.prototype) as any
  const pass={setPipeline(){},setBindGroup(){},draw(){},end(){}}
  bridge.device={createCommandEncoder:()=>({beginRenderPass:()=>pass,finish:()=>({})}),createBindGroup:()=>({}),queue:{submit(){events.push('submit')},async onSubmittedWorkDone(){events.push('ack')}}}
  bridge.context={getCurrentTexture:()=>({createView:()=>({})})};bridge.pipeline={getBindGroupLayout:()=>({})};bridge.canvas={width:1,height:1};bridge.disposed=false
  bridge.diagnosticCost=(x:any)=>{events.push(x.phase);throw Error('diagnostic')}
  const target={width:1,height:1,restoreCanvasPixels(){events.push('import')}}
  await bridge.copyByCanvas({width:1,height:1,view:{}},target)
  expect(events).toEqual(['submit','canvasSubmit','ack','queuePrefixAck','import','glCanvasImport'])
  const error=Error('original ACK');bridge.device.queue.onSubmittedWorkDone=()=>Promise.reject(error)
  await expect(bridge.copyByCanvas({width:1,height:1,view:{}},target)).rejects.toBe(error)
 })
})
