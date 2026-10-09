import {it,expect} from 'vitest'
import {CanonicalFieldPasses} from './dispatcher'
import {prepareObservedFieldPipeline,observedFieldPreparationDiagnostics} from './observedFieldPreload'
import {CANONICAL_DIFFUSE_WGSL as diffuse,CANONICAL_WATER_FRONT_WGSL as front} from './kernels'
it('actual factories reuse prepared exact baselines; diagnostics use original factories',async()=>{
 const asyncDs:GPUComputePipelineDescriptor[]=[],syncDs:GPUComputePipelineDescriptor[]=[]
 const device={createShaderModule:(d:GPUShaderModuleDescriptor)=>({code:d.code}),createComputePipelineAsync:async(d:GPUComputePipelineDescriptor)=>{asyncDs.push(d);return{asyncLabel:d.label}},createComputePipeline:(d:GPUComputePipelineDescriptor)=>{syncDs.push(d);return{syncLabel:d.label}}} as unknown as GPUDevice
 await Promise.all([prepareObservedFieldPipeline(device,'waterFront',front),prepareObservedFieldPipeline(device,'diffuse',diffuse)])
 const passes=new CanonicalFieldPasses(device) as unknown as {pipeline:(kind:'diffuse'|'waterFront',lazy?:boolean,cache?:boolean,sampling?:'manual'|'hardware')=>GPUComputePipeline}
 expect(passes.pipeline('waterFront')).toMatchObject({asyncLabel:'Canonical waterFront'})
 expect(passes.pipeline('diffuse')).toMatchObject({asyncLabel:'Canonical diffuse'})
 passes.pipeline('waterFront');expect(syncDs).toHaveLength(0)
 expect(observedFieldPreparationDiagnostics(device).map(v=>v.hits)).toEqual([1,1])
 expect(passes.pipeline('waterFront',true,false)).toMatchObject({syncLabel:'Canonical waterFront'})
 expect(passes.pipeline('waterFront',false,true)).toMatchObject({syncLabel:'Canonical waterFront'})
 expect(passes.pipeline('waterFront',false,false,'hardware')).toMatchObject({syncLabel:'Canonical waterFront'})
 expect(syncDs).toHaveLength(3)
 expect(asyncDs[0].compute.constants).toEqual({DIAGNOSTIC_LAZY_CLIMB:0})
 expect((asyncDs[0].compute.module as unknown as {code:string}).code).toBe(front)
 expect((asyncDs[1].compute.module as unknown as {code:string}).code).toBe(diffuse)
})
