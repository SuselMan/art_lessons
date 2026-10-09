import {it,expect} from 'vitest'
import {observedFieldDescriptor,prepareObservedFieldPipeline,preparedObservedFieldPipeline,observedFieldPreparationDiagnostics} from './observedFieldPreload'
it('preserves the exact observed default descriptors and caches only ready identical pipelines',async()=>{
 const descriptors:GPUComputePipelineDescriptor[]=[];const modules:GPUShaderModuleDescriptor[]=[];const device={createShaderModule:(d:GPUShaderModuleDescriptor)=>{modules.push(d);return{}},createComputePipelineAsync:async(d:GPUComputePipelineDescriptor)=>{descriptors.push(d);return{kind:d.label}}} as unknown as GPUDevice
 expect(observedFieldDescriptor(device,'waterFront','front').compute.constants).toEqual({DIAGNOSTIC_LAZY_CLIMB:0})
 expect(observedFieldDescriptor(device,'diffuse','diffuse').compute.constants).toBeUndefined()
 await Promise.all([prepareObservedFieldPipeline(device,'waterFront','front'),prepareObservedFieldPipeline(device,'diffuse','diffuse')])
 expect(descriptors.map(d=>d.label)).toEqual(['Canonical waterFront','Canonical diffuse'])
 expect(preparedObservedFieldPipeline(device,'waterFront','front')).toMatchObject({kind:'Canonical waterFront'})
 expect(observedFieldPreparationDiagnostics(device).find(d=>d.kind==='waterFront')?.hits).toBe(1)
 await expect(prepareObservedFieldPipeline(device,'waterFront','other')).rejects.toThrow(/identity/)
 expect(modules.every(d=>d.label==='Canonical waterFront'||d.label==='Canonical diffuse')).toBe(true)
})
it('rejects unsupported/rejected compilation without installing incomplete entries',async()=>{
 await expect(prepareObservedFieldPipeline({} as GPUDevice,'diffuse','x')).rejects.toThrow(/real async/)
 const device={createShaderModule:()=>({}),createComputePipelineAsync:async()=>{throw Error('lost')}} as unknown as GPUDevice
 await expect(prepareObservedFieldPipeline(device,'diffuse','x')).rejects.toThrow('lost')
 expect(observedFieldPreparationDiagnostics(device)).toEqual([])
})
