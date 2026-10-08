import { describe,expect,it } from 'vitest'
import { runDetachedWarmup,DetachedWarmupScope } from './detachedWarmup'
import type { CanonicalGpuField } from './types'
function mock(){
 const allocated:CanonicalGpuField[]=[],destroyed:CanonicalGpuField[]=[]
 let waits=0
 return {allocated,destroyed,get waits(){return waits},owner:{createField(label:string,width:number,height:number,filter:'nearest'|'linear'){const f={label,width,height,filter,format:'rgba8unorm'} as CanonicalGpuField;allocated.push(f);return f},destroyField(f:CanonicalGpuField){destroyed.push(f)},async whenIdle(){waits++}}}
}
describe('detached QA warm resource scope',()=>{
 it('uses bounded actual formats and retires all fields without journal access',async()=>{
  const m=mock(),journal=JSON.stringify([{type:'stroke',seed:8}]),history=[journal]
  const r=await runDetachedWarmup(m.owner,s=>{for(let i=0;i<12;i++)s.create(`tile${i}`,1024,1024);for(let i=0;i<4;i++)s.create(`pressure${i}`,1536,1536,i===1?'linear':'nearest')})
  expect(r.peakBytes).toBe(84*1024*1024);expect(m.destroyed).toEqual(m.allocated);expect(m.waits).toBe(1);expect(history).toEqual([journal])
 })
 it('rejects cap before allocation and cleans encoded error paths',async()=>{
  const m=mock()
  await expect(runDetachedWarmup(m.owner,s=>{s.create('one',4,4);s.create('too large',4,4)},64)).rejects.toThrow('cap')
  expect(m.allocated).toHaveLength(1);expect(m.destroyed).toEqual(m.allocated)
 })
 it('does not destroy a shared owner/device or wait twice on repeated retirement',async()=>{
  const m=mock(),s=new DetachedWarmupScope(m.owner);s.create('scratch',1,1)
  await s.close();await s.close();expect(m.waits).toBe(1);expect(()=>s.create('late',1,1)).toThrow('retired')
 })
 it('cleans fields when completion rejects',async()=>{
  const m=mock();m.owner.whenIdle=async()=>{throw new Error('device lost')}
  await expect(runDetachedWarmup(m.owner,s=>{s.create('scratch',1,1)})).rejects.toThrow('device lost');expect(m.destroyed).toEqual(m.allocated)
 })
})

it('minimal raw canvas warmup publishes nowhere and uses one4MiB field',async()=>{
 const {warmDetachedRawCanvas}=await import('./detachedWarmup'),m=mock(),calls:string[]=[]
 const result=await warmDetachedRawCanvas({...m.owner,clearField(){calls.push('clear')}},{async warmDetachedCanvas(){calls.push('detached canvas')}})
 expect(calls).toEqual(['clear','detached canvas']);expect(result.peakBytes).toBe(4*1024*1024);expect(m.destroyed).toEqual(m.allocated)
})
