import {afterEach,expect,it,vi} from 'vitest'
import {CanonicalCarryOracle} from './pairedCarryOracle'
import {CanonicalFieldBuffer} from './fieldBuffer'
import type {CanonicalWatercolorWebGpu} from './backend'
import type {CanonicalGpuContext} from './types'
afterEach(()=>vi.unstubAllGlobals())
function fixture(){
 vi.stubGlobal('GPUBufferUsage',{COPY_DST:1,MAP_READ:2})
 const events:string[]=[],retired:string[]=[],staging:Array<{destroy:ReturnType<typeof vi.fn>}>=[]
 const owner={createField:(label:string,width:number,height:number,filter:string)=>({label,width,height,filter,texture:{label},view:{}}),copyField:(a:{label:string},b:{label:string})=>events.push('copy '+a.label+'→'+b.label),destroyField:(f:{label:string})=>retired.push(f.label)} as unknown as CanonicalWatercolorWebGpu
 const buffer=(label:string)=>new CanonicalFieldBuffer(owner,64,64,'nearest',label)
 const fields={p:buffer('oldP'),c:buffer('oldC'),fixed:buffer('fixed'),outP:buffer('outP'),outC:buffer('outC')}
 const ctx={device:{createBuffer:()=>{const b={destroy:vi.fn()};staging.push(b);return b}},encoder:{copyTextureToBuffer:(src:{texture:{label:string}})=>events.push('snapshot '+src.texture.label)}} as unknown as CanonicalGpuContext
 return{events,retired,staging,fields,owner,ctx}
}
it('snapshots actual OLD inputs before paired work and both outputs after legacy work; shadows preserve outside-scissor initial bytes',()=>{
 const f=fixture(),oracle=new CanonicalCarryOracle(f.ctx,f.owner,f.fields,.2,{},()=>f.events.push('paired'),(p,c)=>{expect(p).not.toBe(f.fields.outP);expect(c).not.toBe(f.fields.outC);f.events.push('legacy')})
 expect(f.events).toEqual(['copy outP→carry oracle expectedP','copy outC→carry oracle expectedC','snapshot oldP','snapshot oldC','snapshot fixed','paired','legacy','snapshot outP','snapshot outC','snapshot carry oracle expectedP','snapshot carry oracle expectedC'])
 expect(f.retired).toEqual(['carry oracle expectedP','carry oracle expectedC'])
 expect(f.staging.every(b=>b.destroy.mock.calls.length===0)).toBe(true)
 oracle.destroy();oracle.destroy();expect(f.staging.every(b=>b.destroy.mock.calls.length===1)).toBe(true)
})
it('a dispatch failure releases unique snapshot buffers and retires shadows without swallowing error',()=>{
 const f=fixture(),error=new Error('pair dispatch failed')
 expect(()=>new CanonicalCarryOracle(f.ctx,f.owner,f.fields,.2,{},()=>{throw error},()=>{})).toThrow(error)
 expect(f.staging).toHaveLength(3);expect(f.staging.every(b=>b.destroy.mock.calls.length===1)).toBe(true);expect(f.retired).toHaveLength(2)
})
