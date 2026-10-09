import {afterEach,expect,it,vi} from 'vitest'
import {CanonicalFieldOps,type CanonicalFieldOptions} from './fieldOps'
import type {CanonicalGpuContext,CanonicalGpuField,CanonicalPassResources} from '../types'
afterEach(()=>vi.unstubAllGlobals())
function fixture(){
 vi.stubGlobal('GPUTextureUsage',{COPY_SRC:1,COPY_DST:2});vi.stubGlobal('GPUBufferUsage',{UNIFORM:4,COPY_DST:2})
 const createBuffer=vi.fn(()=>({destroy:vi.fn()})),copy=vi.fn(),pass={setPipeline:vi.fn(),setBindGroup:vi.fn(),dispatchWorkgroups:vi.fn(),end:vi.fn()},begin=vi.fn(()=>pass)
 const device={createBuffer,createShaderModule:vi.fn(()=>({})),createComputePipeline:vi.fn(()=>({getBindGroupLayout:()=>({})})),createBindGroup:vi.fn(()=>({})),queue:{writeBuffer:vi.fn()}} as unknown as GPUDevice
 const field=(label:string)=>({width:8,height:6,format:'rgba8unorm',filter:'nearest',label,texture:{usage:3},view:{}} as CanonicalGpuField)
 const a=field('a'),b=field('b'),out=field('out'),r={a,b,out,coverage:a,paper:{} as CanonicalPassResources['paper'],world:{x:0,y:0,width:8,height:6}}
 const ctx={device,encoder:{copyTextureToTexture:copy,beginComputePass:begin},nearest:{},linear:{}} as unknown as CanonicalGpuContext
 return{ops:new CanonicalFieldOps(device),ctx,r,copy,begin,createBuffer,owner:{ownsLiveField:vi.fn(()=>true)}}
}
it('DEV owned exact mode1 ±0 emits only bounded top-down texture copy, without uniform',()=>{
 for(const k of [0,-0]){const f=fixture();expect(f.ops.run(f.ctx,f.r,1,k,{scissor:[1,2,3,2],diagnosticIdentityCopyOwner:f.owner})).toBeNull();expect(f.copy).toHaveBeenCalledWith({texture:f.r.a.texture,origin:{x:1,y:2,z:0}},{texture:f.r.out.texture,origin:{x:1,y:2,z:0}},{width:3,height:2,depthOrArrayLayers:1});expect(f.begin).not.toHaveBeenCalled();expect(f.createBuffer).not.toHaveBeenCalled();expect(f.owner.ownsLiveField).toHaveBeenCalledTimes(8)}
})
it('OFF and unsafe fields/rect/filter/domain fall back to original shader',()=>{
 const cases=[()=>({}),()=>({diagnosticIdentityCopyOwner:{ownsLiveField:()=>false}}),()=>({scissor:[.5,0,3,2] as const}),()=>({scissor:[0,0,9,2] as const}),()=>({world:[0,0,1] as const}),()=>({linearInputMask:1})]
 for(const change of cases){const f=fixture(),o:CanonicalFieldOptions={diagnosticIdentityCopyOwner:f.owner,...change()};if(change===cases[0])delete o.diagnosticIdentityCopyOwner;expect(f.ops.run(f.ctx,f.r,1,0,o)).not.toBeNull();expect(f.copy).not.toHaveBeenCalled();expect(f.begin).toHaveBeenCalledTimes(1)}
 const f=fixture();Object.assign(f.r.a.texture,{usage:2});f.ops.run(f.ctx,f.r,1,0,{diagnosticIdentityCopyOwner:f.owner});expect(f.copy).not.toHaveBeenCalled()
})
it('original secondary alias/finite/filter/device validation precedes fastpath',()=>{
 for(const options of [{c:{},linearInputMask:64},{k:NaN},{c:'alias'},{device:'foreign'}]){const f=fixture();const o:any={diagnosticIdentityCopyOwner:f.owner};if(options.c==='alias')o.c=f.r.out;if(options.linearInputMask)o.linearInputMask=options.linearInputMask;if(options.device)Object.assign(f.ctx,{device:{}});expect(()=>f.ops.run(f.ctx,f.r,1,options.k??0,o)).toThrow();expect(f.copy).not.toHaveBeenCalled()}
})
it('Q8 fit(a+b*±0) preserves every channel incl nonzero RGB at alpha0',()=>{
 for(const k of [0,-0])for(let a=0;a<256;a++)for(let b=0;b<256;b++){const value=Math.fround(Math.fround(a/255)+Math.fround(Math.fround(b/255)*Math.fround(k)));expect(Math.round(Math.fround(value/Math.max(1,value))*255)).toBe(a)}
})

import {CanonicalPlanAdapter} from '../settlePlanAdapter'
import type {CanonicalFieldBuffer} from '../fieldBuffer'
it('adapter retains only real shader uniforms and preserves active quantum requirement',()=>{const adapter=Object.create(CanonicalPlanAdapter.prototype) as CanonicalPlanAdapter,uniform={destroy:vi.fn()} as unknown as GPUBuffer,encode=vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(uniform),buffers:any[]=[];Object.assign(adapter,{context:{},transient:buffers,commands:{encode},owner:{paper:{},noise:{}},diagnosticIdentityFieldCopy:true});const field={field:{},width:8,height:6} as CanonicalFieldBuffer;adapter.fieldOp(field,field,field,1,0);expect(buffers).toHaveLength(0);adapter.fieldOp(field,field,field,1,1);expect(buffers).toEqual([uniform]);Object.assign(adapter,{context:null});expect(()=>adapter.fieldOp(field,field,field,1,0)).toThrow('active quantum');expect(encode).toHaveBeenCalledTimes(2)})

it('wrong source dimensions/format/linear metadata and copy failure never count a fastpath',()=>{for(const change of [{width:7},{format:'r32float'},{filter:'linear'}]){const f=fixture();Object.assign(f.r.a,change);f.ops.run(f.ctx,f.r,1,0,{diagnosticIdentityCopyOwner:f.owner});expect(f.copy).not.toHaveBeenCalled();expect(f.ops.diagnosticIdentityCopyCalls).toBe(0)}const f=fixture();f.copy.mockImplementation(()=>{throw Error('copy failure')});expect(()=>f.ops.run(f.ctx,f.r,1,0,{diagnosticIdentityCopyOwner:f.owner})).toThrow('copy failure');expect(f.ops.diagnosticIdentityCopyCalls).toBe(0);expect(f.createBuffer).not.toHaveBeenCalled()})
