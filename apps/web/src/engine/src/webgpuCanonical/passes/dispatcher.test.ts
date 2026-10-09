import { afterEach, expect, it, vi } from 'vitest'
import type { CanonicalGpuContext, CanonicalGpuField, CanonicalPassResources } from '../types'
import { CanonicalFieldPasses, packPassUniforms } from './dispatcher'
import { CanonicalBasicFieldPass } from './fieldBasic'
import { CanonicalStaticFrontCache } from './staticFrontCache'
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const field = (width=16,height=8):CanonicalGpuField => { const value={width,height,label:'fixture',filter:'nearest' as const,format:'rgba8unorm' as const,texture:{} as GPUTexture,view:{} as GPUTextureView};return value }
function fixture() {
  vi.stubGlobal('GPUBufferUsage',{UNIFORM:64,COPY_DST:8})
  const buffers:GPUBuffer[]=[], writes:Float32Array[]=[], dispatches:number[][]=[], entries:GPUBindGroupEntry[][]=[]
  const device={lost:new Promise(()=>{}),queue:{writeBuffer(_b:unknown,_o:unknown,data:Float32Array){writes.push(data.slice())}},createBuffer(){const b={destroy:vi.fn()} as unknown as GPUBuffer;buffers.push(b);return b},createShaderModule:()=>({}),createComputePipeline:()=>({getBindGroupLayout:()=>({})}),createBindGroup(d:GPUBindGroupDescriptor){entries.push([...d.entries]);return {}}} as unknown as GPUDevice
  const encoder={beginComputePass:()=>({setPipeline(){},setBindGroup(){},dispatchWorkgroups(x:number,y:number){dispatches.push([x,y])},end(){}})} as unknown as GPUCommandEncoder
  const ctx={device,encoder,nearest:{} as GPUSampler,linear:{} as GPUSampler} satisfies CanonicalGpuContext
  const resources:CanonicalPassResources={a:field(),b:field(),coverage:field(),out:field(),paper:{field:field(2048,2048),origin:[3,-11],texSize:[256,256],scale:1.5},world:{x:6,y:6,width:32,height:16}}
  return {device,ctx,resources,buffers,writes,dispatches,entries}
}
it('encodes separate dispatches and unique uniform buffers preserving pass boundaries',()=>{
  const f=fixture(),passes=new CanonicalFieldPasses(f.device)
  const first=passes.diffuse(f.ctx,f.resources,2,true), second=passes.waterFront(f.ctx,f.resources,field(251,251),{dryCost:5,costMax:20,climb:3,floor:.2,stride:4})
  expect(first).not.toBe(second);expect(f.dispatches).toEqual([[2,1],[2,1]])
  expect(f.writes[0]).toEqual(new Float32Array([16,8,3,-11,256,256,1.5,1.5,.09,.03,2,1,0,0,0,0]))
  expect(f.entries.map(e=>e.map(x=>x.binding))).toEqual([[0,1,2,5,6],[0,1,2,5,6,3,4]])
  expect(passes.counters).toEqual({diffuse:1,waterFront:1,pixels:256})
})
it('rejects aliases, invalid lattice and unsupported fibre mode instead of weakening model',()=>{
  const f=fixture(),passes=new CanonicalFieldPasses(f.device)
  expect(()=>passes.diffuse(f.ctx,{...f.resources,out:f.resources.a},1,false)).toThrow(/aliases/)
  expect(()=>passes.waterFront(f.ctx,f.resources,field(250,251),{dryCost:1,costMax:5,climb:1,floor:.2,stride:1})).toThrow(/251/)
  expect(()=>new CanonicalBasicFieldPass(f.device).run(f.ctx,f.resources,1,1,{world:[0,0,1]})).toThrow(/pending/)
  expect(f.dispatches).toHaveLength(0)
})
it('validates finite prepared uniforms',()=>{
  const f=fixture()
  expect(()=>packPassUniforms(f.resources,[NaN,0,1,0],[0,0,0,0])).toThrow(/finite/)
})

it('front source LINEAR diagnostic records exact source filter without changing default coefficients',()=>{
 const f=fixture(),p=new CanonicalFieldPasses(f.device)
 const linear={...f.resources,a:{...f.resources.a,filter:'linear' as const}}
 p.waterFront(f.ctx,linear,field(251,251),{dryCost:5,costMax:20,climb:3,floor:.2,stride:1,diagnosticSourceFilter:'manual'})
 expect(Array.from(f.writes[0].slice(12))).toEqual([5,0,1,0])
 const g=fixture(),linearDefault={...g.resources,a:{...g.resources.a,filter:'linear' as const}}
 new CanonicalFieldPasses(g.device).waterFront(g.ctx,linearDefault,field(251,251),{dryCost:5,costMax:20,climb:3,floor:.2,stride:1})
 expect(Array.from(g.writes[0].slice(12))).toEqual([5,0,0,0])
})

it('destroys untransferred uniforms exactly once on cache preparation failure',()=>{
 const f=fixture(),error=new Error('cache preparation failed')
 vi.spyOn(CanonicalStaticFrontCache.prototype,'getOrEncode').mockImplementation(()=>{throw error})
 expect(()=>new CanonicalFieldPasses(f.device).waterFront(f.ctx,f.resources,field(251,251),{dryCost:5,costMax:20,climb:3,floor:.2,stride:1,diagnosticStaticCache:true})).toThrow(error)
 expect(f.buffers).toHaveLength(1);expect(f.buffers[0].destroy).toHaveBeenCalledTimes(1)
 expect(f.dispatches).toHaveLength(0)
})
it('transfers successful uniforms and preserves original errors when cleanup fails',()=>{
 const f=fixture(),p=new CanonicalFieldPasses(f.device)
 const buffer=p.diffuse(f.ctx,f.resources,1,false)
 expect(buffer.destroy).not.toHaveBeenCalled()
 const error=new Error('bind failed')
 vi.spyOn(f.device,'createBindGroup').mockImplementation(()=>{throw error})
 vi.spyOn(f.device,'createBuffer').mockImplementation(()=>({destroy:()=>{throw new Error('cleanup failed')}} as unknown as GPUBuffer))
 expect(()=>p.diffuse(f.ctx,f.resources,1,false)).toThrow(error)
})
it('film diagnostic passport records actual compiled source and only successful dispatches',()=>{
 const f=fixture(),p=new CanonicalFieldPasses(f.device),params={dryCost:5,costMax:20,climb:3,floor:.2,stride:1}
 p.waterFront(f.ctx,f.resources,field(251,251),params);expect(p.filmVariantDiagnostics).toEqual([])
 p.waterFront(f.ctx,f.resources,field(251,251),{...params,diagnosticFilmHoist:true});expect(p.filmVariantDiagnostics[0].encoded).toBe(1);expect(p.filmVariantDiagnostics[0].code).toContain('if(!filmReady){film=')
 p.waterFront(f.ctx,f.resources,field(251,251),{...params,diagnosticFilmHoist:true});expect(p.filmVariantDiagnostics[0].encoded).toBe(2)
 vi.spyOn(f.device,'createBindGroup').mockImplementation(()=>{throw Error('bind failed')});expect(()=>p.waterFront(f.ctx,f.resources,field(251,251),{...params,diagnosticFilmHoist:true})).toThrow();expect(p.filmVariantDiagnostics[0].encoded).toBe(2)
})
