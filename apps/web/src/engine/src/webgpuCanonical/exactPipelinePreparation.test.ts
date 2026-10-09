import {CanonicalComposite} from './render'
import {CanonicalRoomTileBridge} from './roomTileBridge'
import {CanonicalRibbonDeposit,canonicalRibbonRecipe} from './deposit'
import {CanonicalStampDeposit,canonicalStampRecipe} from './stamp'
import {CanonicalBrushContact,canonicalBrushRecipe} from './brush'
import {it,expect,vi,afterEach} from 'vitest'
import {prepareExactPipeline,preparedExactPipeline,retireExactPipelinePreparation,type ExactPipelineRecipe} from './exactPipelinePreparation'
import {firstContactPipelineRecipes,prepareFirstContactPipelines} from './sourcePipelinePreparation'
afterEach(()=>vi.unstubAllGlobals())
const recipe:ExactPipelineRecipe={key:'unit',code:'shader',kind:'compute',descriptor:module=>({layout:'auto',compute:{module,entryPoint:'main'}})}
it('prepares exact shared 12 render + 3 compute recipes with zero field allocation/dispatch',async()=>{
 const recipes=firstContactPipelineRecipes();expect(recipes.filter(x=>x.kind==='render')).toHaveLength(12);expect(recipes.filter(x=>x.kind==='compute')).toHaveLength(3)
 let render=0,compute=0
 const device={createShaderModule:()=>({}),createRenderPipelineAsync:async()=>({render:++render}),createComputePipelineAsync:async()=>({compute:++compute})} as unknown as GPUDevice
 const proofs=await prepareFirstContactPipelines(device);expect(proofs).toHaveLength(15);expect([render,compute]).toEqual([12,3])
 for(const r of recipes){const a=preparedExactPipeline(device,r);expect(a).toBe(preparedExactPipeline(device,r))}
 // Mock deliberately has no texture/buffer/queue/encoder API: any such work fails.
})
it('isolates devices, refuses changed code or descriptors, and keeps failed compiler retryable',async()=>{
 let fail=true;const result={} as GPUComputePipeline
 const device={createShaderModule:()=>({}),createComputePipelineAsync:async()=>{if(fail)throw Error('compile rejected');return result}} as unknown as GPUDevice
 await expect(prepareExactPipeline(device,recipe)).rejects.toThrow('compile rejected');expect(preparedExactPipeline(device,recipe)).toBeUndefined()
 fail=false;await prepareExactPipeline(device,recipe);expect(preparedExactPipeline(device,recipe)).toBe(result)
 expect(preparedExactPipeline({} as GPUDevice,recipe)).toBeUndefined()
 await expect(prepareExactPipeline(device,{...recipe,code:'changed'})).rejects.toThrow('identity')
 expect(()=>preparedExactPipeline(device,{...recipe,descriptor:module=>({layout:'auto',compute:{module,entryPoint:'other'}})})).toThrow('identity')
})
it('retirement rejects late completion and all parallel rejection promises remain handled',async()=>{
 let resolve!:(value:GPUComputePipeline)=>void
 const device={createShaderModule:()=>({}),createComputePipelineAsync:()=>new Promise<GPUComputePipeline>(r=>{resolve=r})} as unknown as GPUDevice
 const pending=prepareExactPipeline(device,recipe),handled=expect(pending).rejects.toThrow('retired');await Promise.resolve()
 expect(()=>preparedExactPipeline(device,recipe)).toThrow('not prepared');retireExactPipelinePreparation(device);resolve({} as GPUComputePipeline);await handled
 expect(()=>preparedExactPipeline(device,recipe)).toThrow('retired')
 await expect(prepareExactPipeline(device,recipe)).rejects.toThrow('retired')
})
it('production stamp/ribbon/brush factories consume the same async-created pipeline objects',async()=>{
 const device={createShaderModule:()=>({}),createRenderPipelineAsync:async()=>({}),createComputePipelineAsync:async()=>({})} as unknown as GPUDevice
 const recipes=[canonicalStampRecipe('coverage'),canonicalRibbonRecipe('coverage'),canonicalBrushRecipe(),canonicalBrushRecipe(true)]
 await prepareFirstContactPipelines(device)
 device.createShaderModule=()=>{throw Error('Cache HIT must not create shader module')}
 device.createSampler=()=>({} as GPUSampler)
 vi.stubGlobal('GPUTextureUsage',{RENDER_ATTACHMENT:1,COPY_SRC:2})
 const composite=new CanonicalComposite(device),raw=new CanonicalRoomTileBridge(device,{getContext:()=>({configure:()=>{}})} as unknown as HTMLCanvasElement,1024,1024)
 expect(Reflect.get(composite,'pipeline')).toBe(preparedExactPipeline(device,firstContactPipelineRecipes().find(r=>r.key==='canonicalCompositeRecipe')!))
 expect(Reflect.get(raw,'pipeline')).toBe(preparedExactPipeline(device,firstContactPipelineRecipes().find(r=>r.key==='canonicalRawCanvasRecipe')!))
 vi.unstubAllGlobals()
 const stamp=new CanonicalStampDeposit(device,{} as never,true),ribbon=new CanonicalRibbonDeposit(device,{} as never,true),brush=new CanonicalBrushContact(device)
 expect(Reflect.get(stamp,'coverage')).toBe(preparedExactPipeline(device,recipes[0]))
 expect(ribbon.coverage).toBe(preparedExactPipeline(device,recipes[1]))
 expect(Reflect.get(brush,'pipeline')).toBe(preparedExactPipeline(device,recipes[2]))
 expect(Reflect.get(brush,'singlePipeline')).toBe(preparedExactPipeline(device,recipes[3]))
 // No synchronous createPipeline API exists on this device: fallback would fail.
})
it('default cache MISS preserves one shared shader module and exact descriptor, isolated from another device',async()=>{
 const prepared={createShaderModule:()=>({}),createRenderPipelineAsync:async()=>({})} as unknown as GPUDevice
 await prepareExactPipeline(prepared,canonicalStampRecipe('coverage'))
 let modules=0;const module={} as GPUShaderModule,descriptors:GPURenderPipelineDescriptor[]=[],sync={} as GPURenderPipeline
 const other={createShaderModule:()=>{modules++;return module},createRenderPipeline:(d:GPURenderPipelineDescriptor)=>{descriptors.push(d);return sync}} as unknown as GPUDevice
 const instance=new CanonicalStampDeposit(other,{} as never,true);expect(modules).toBe(1)
 expect(Reflect.get(instance,'coverage')).toBe(sync);expect(modules).toBe(1)
 expect(descriptors).toEqual([canonicalStampRecipe('coverage').descriptor(module)])
 retireExactPipelinePreparation(prepared)
 expect(()=>new CanonicalStampDeposit(prepared,{} as never,true)).toThrow('retired')
})
it('constructor rejects pending prepared coverage without compiling a fallback module',async()=>{
 let resolve!:(p:GPURenderPipeline)=>void,modules=0
 const device={createShaderModule:()=>{modules++;return{}},createRenderPipelineAsync:()=>new Promise<GPURenderPipeline>(r=>{resolve=r})} as unknown as GPUDevice
 const pending=prepareExactPipeline(device,canonicalStampRecipe('coverage'));await Promise.resolve()
 expect(()=>new CanonicalStampDeposit(device,{} as never,true)).toThrow('not prepared');expect(modules).toBe(1)
 resolve({} as GPURenderPipeline);await pending
})
