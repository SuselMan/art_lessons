import {expect,it} from 'vitest'
import {StageAudit,compareStages,spatialSummary} from '../../../../../../docs/qa/harness/728-paired-carry-plan/stageAudit'
import type {CanonicalFieldBuffer} from './fieldBuffer'
const buffer={width:4,height:4} as CanonicalFieldBuffer
it('snapshot freezes CPU phase at call boundary and compares first operation/source or final divergence',async()=>{
 const a=new StageAudit();a.record('source',[new Float32Array([1,2,3])]);const pending=a.snapshot(1,'source',{layer:buffer},async()=>new Uint8Array(64).fill(1));a.record('plan',[{radius:400,standing:1}]);const source=await pending
 expect(source.planCalls).toBe(0);expect(source.sourceCalls).toBe(1)
 const final=await a.snapshot(1,'finish',{layer:buffer},async()=>new Uint8Array(64).fill(2))
 expect(compareStages([source,final],[source,final]).exact).toBe(true)
 const changed={...final,roles:{layer:{...final.roles.layer!,sha256:'different'}}}
 expect(compareStages([source,final],[source,changed]).firstDivergence).toMatchObject({index:1,operation:1,stage:'finish',roleDifferences:[{role:'layer'}]})
})
it('staging budget rejects before submitting any readback',()=>{
 const audit=new StageAudit();let reads=0
 expect(()=>audit.snapshot(1,'source',{huge:{width:4096,height:4096} as CanonicalFieldBuffer},async()=>{reads++;return new Uint8Array()})).toThrow('40MiB')
 expect(reads).toBe(0)
})
it('CPU parameter and typed source byte changes are recorded separately from pixel changes',async()=>{
 const a=new StageAudit(),b=new StageAudit();a.record('source',[new Float32Array([1,2])]);b.record('source',[new Float32Array([1,3])]);const read=async()=>new Uint8Array(64)
 const x=await a.snapshot(1,'source',{layer:buffer},read),y=await b.snapshot(1,'source',{layer:buffer},read)
 expect(x.roles).toEqual(y.roles);expect(compareStages([x],[y]).firstDivergence).toMatchObject({cpuDifferences:[{key:'cpuSourceHash'}]})
})

it('spatial solvent gate preserves GL reveal axes and counts outside bytes',()=>{
 const bytes=new Uint8Array(4*4*4);bytes[4]=2;bytes[(3*4+2)*4+3]=3
 expect(spatialSummary(bytes,4,4,[1,3,1,1])).toEqual({bbox:[1,0,2,4],nonzeroOutsideRevealRect:1,revealRectGL:[1,3,1,1]})
 expect(spatialSummary(new Uint8Array(64),4,4,null).bbox).toBeNull()
})

it('solvent init snapshots are encoded synchronously and reject resource aliasing',async()=>{
 const {captureSolventInit}=await import('../../../../../../docs/qa/harness/728-paired-carry-plan/solventInit')
 Object.assign(globalThis,{GPUBufferUsage:{COPY_DST:1,MAP_READ:2}})
 const events:string[]=[],device={createBuffer:()=>({destroy:()=>events.push('destroy')})} as unknown as GPUDevice
 const encoder={copyTextureToBuffer:()=>events.push('copy')} as unknown as GPUCommandEncoder
 const load={width:4,height:4,texture:{}} as unknown as CanonicalFieldBuffer,base={width:4,height:4,texture:{}} as unknown as CanonicalFieldBuffer
 const pending=captureSolventInit(device,encoder,{load,base});expect(events).toEqual(['copy','copy']);pending.dispose();expect(events).toEqual(['copy','copy','destroy','destroy'])
 expect(()=>captureSolventInit(device,encoder,{load,base:load})).toThrow('alias')
})
