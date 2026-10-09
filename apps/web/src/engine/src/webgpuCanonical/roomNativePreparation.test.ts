import {it,expect,vi,afterEach} from 'vitest'
const state=vi.hoisted(()=>({create:vi.fn()}))
vi.mock('./backend',()=>({CanonicalWatercolorWebGpu:{create:state.create}}))
vi.mock('../paper/paperLoader',()=>({getPaperBytes:async()=>new Uint8Array([1,2])}))
import {RoomNativeRuntime,type RoomNativeRuntimeContext} from './roomNativeRuntime'
import {CANONICAL_DIFFUSE_WGSL as diffuse,CANONICAL_WATER_FRONT_WGSL as front} from './passes/kernels'
import {CANONICAL_FIELD_OPS_HARDWARE_LINEAR_WGSL as pressure} from './passes/fieldOps'
const context=():RoomNativeRuntimeContext=>({diagnosticAsyncObservedFields:true,diagnosticAsyncCarryPressure:true,diagnosticCarryHardwarePressure:true,fifo:{} as RoomNativeRuntimeContext['fifo'],paper:'fine',paperScale:1,paperWorld:{w:1754,h:2480},board:{w:1754,h:2480},resolve:()=>[],layerId:()=>undefined,changed:()=>{},failed:()=>{}})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
function setup(){
 const calls:{descriptor:GPUComputePipelineDescriptor;resolve:(v:GPUComputePipeline)=>void;reject:(e:Error)=>void}[]=[]
 const device={createShaderModule:(d:GPUShaderModuleDescriptor)=>({code:d.code}),createComputePipelineAsync:(descriptor:GPUComputePipelineDescriptor)=>new Promise<GPUComputePipeline>((resolve,reject)=>calls.push({descriptor,resolve,reject}))} as unknown as GPUDevice
 const backend={device,destroy:vi.fn()};state.create.mockResolvedValue(backend)
 vi.stubGlobal('document',{createElement:()=>({})});vi.spyOn(console,'info').mockImplementation(()=>{})
 return{calls,backend}
}
it('actual runtime submits three exact descriptors together; any pending compiler denies READY',async()=>{
 const {calls,backend}=setup();let ready=false
 const promise=RoomNativeRuntime.create(context()).then(value=>{ready=true;return value})
 await vi.waitFor(()=>expect(calls).toHaveLength(3))
 expect(calls.map(x=>x.descriptor.label)).toEqual(['Canonical waterFront','Canonical diffuse','DIAGNOSTIC canonical hardware LINEAR fields'])
 expect(calls.map(x=>(x.descriptor.compute.module as unknown as {code:string}).code)).toEqual([front,diffuse,pressure])
 calls[2].resolve({} as GPUComputePipeline);calls[0].resolve({} as GPUComputePipeline)
 await new Promise(r=>setTimeout(r,0));expect(ready).toBe(false)
 calls[1].resolve({} as GPUComputePipeline)
 const runtime=await promise;expect(ready).toBe(true);expect(backend.destroy).not.toHaveBeenCalled()
 expect(runtime.observedFieldPreparation.map(x=>({kind:x.kind,completed:x.completed,hits:x.hits}))).toEqual([{kind:'waterFront',completed:true,hits:0},{kind:'diffuse',completed:true,hits:0}])
 expect(runtime.asyncCarryPressureDiagnostics).toMatchObject({completed:true,hits:0})
})
it('one rejected compiler denies READY, destroys owner once, handles remaining rejections',async()=>{
 const {calls,backend}=setup();const promise=RoomNativeRuntime.create(context())
 const failure=expect(promise).rejects.toThrow('compiler failure')
 await vi.waitFor(()=>expect(calls).toHaveLength(3))
 calls[1].reject(Error('compiler failure'));await failure
 expect(backend.destroy).toHaveBeenCalledOnce()
 calls[0].reject(Error('device destroyed'));calls[2].reject(Error('device destroyed'))
 await new Promise(r=>setTimeout(r,0))
})
function setupSource(){
 const calls:{resolve:(v:never)=>void;reject:(e:Error)=>void}[]=[]
 const compile=()=>new Promise<never>((resolve,reject)=>calls.push({resolve,reject}))
 const device={createShaderModule:()=>({}),createRenderPipelineAsync:compile,createComputePipelineAsync:compile} as unknown as GPUDevice
 const backend={device,destroy:vi.fn()};state.create.mockResolvedValue(backend)
 vi.stubGlobal('document',{createElement:()=>({})});vi.spyOn(console,'info').mockImplementation(()=>{})
 return{calls,backend}
}
it('exact source preparation admits 15 pipelines before READY with no dispatch or field allocation',async()=>{
 const {calls,backend}=setupSource();let ready=false
 const ctx={...context(),diagnosticAsyncObservedFields:false,diagnosticAsyncCarryPressure:false,diagnosticSourcePrecompile:true}
 const pending=RoomNativeRuntime.create(ctx).then(r=>{ready=true;return r})
 await vi.waitFor(()=>expect(calls).toHaveLength(15))
 for(const call of calls.slice(0,14))call.resolve({} as never)
 await new Promise(r=>setTimeout(r,0));expect(ready).toBe(false)
 calls[14].resolve({} as never);const runtime=await pending
 expect(runtime.sourcePipelinePreparation).toHaveLength(15);expect(runtime.sourcePipelinePreparation.every(x=>x.completed&&x.hits===0)).toBe(true)
 await runtime.retire('unmount');expect(runtime.sourcePipelinePreparation).toHaveLength(0);expect(backend.destroy).toHaveBeenCalledOnce()
})
it('source compiler rejection destroys owner once, retires cache, handles remaining promises',async()=>{
 const {calls,backend}=setupSource();const pending=RoomNativeRuntime.create({...context(),diagnosticAsyncObservedFields:false,diagnosticAsyncCarryPressure:false,diagnosticSourcePrecompile:true})
 const failed=expect(pending).rejects.toThrow('source rejected');await vi.waitFor(()=>expect(calls).toHaveLength(15));calls[0].reject(Error('source rejected'));await failed
 expect(backend.destroy).toHaveBeenCalledOnce();for(const call of calls.slice(1))call.reject(Error('device destroyed'));await new Promise(r=>setTimeout(r,0))
})
it('source preparation excludes detached dispatch warm and altered tip before backend allocation',async()=>{
 state.create.mockClear()
 for(const variant of [{diagnosticFirstLiveWarmup:true},{diagnosticRawCanvasWarmup:true},{diagnosticTipContactA:true}])await expect(RoomNativeRuntime.create({...context(),diagnosticSourcePrecompile:true,...variant})).rejects.toThrow('dispatch warm')
 expect(state.create).not.toHaveBeenCalled()
})
