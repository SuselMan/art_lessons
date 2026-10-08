import {afterEach,expect,it,vi} from 'vitest'
import {CanonicalBrushContact} from './brush'
import type {CanonicalGpuField} from './types'
afterEach(()=>vi.unstubAllGlobals())
function fixture(deferPaired:boolean){
 const modules:GPUShaderModuleDescriptor[]=[],pipelines:GPUComputePipelineDescriptor[]=[],writes:number[][]=[],events:string[]=[]
 const device={createShaderModule:(d:GPUShaderModuleDescriptor)=>{modules.push(d);return d},createComputePipeline:(d:GPUComputePipelineDescriptor)=>{pipelines.push(d);return{getBindGroupLayout:()=>({})}},createBuffer:()=>({destroy:vi.fn()}),createBindGroup:()=>({}),queue:{writeBuffer:(_b:unknown,_o:unknown,v:Float32Array)=>writes.push(Array.from(new Uint8Array(v.buffer)))}} as unknown as GPUDevice
 const brush=new CanonicalBrushContact(device,deferPaired)
 const field=():CanonicalGpuField=>({label:'fixture',width:16,height:16,texture:{} as GPUTexture,view:{} as GPUTextureView,format:'rgba8unorm',filter:'nearest'})
 const fields={pigment:field(),color:field(),water:field(),flow:field(),out:field()}
 const pass={setPipeline:()=>events.push('pipeline'),setBindGroup:()=>events.push('bind'),dispatchWorkgroups:(x:number,y:number)=>events.push(`dispatch:${x},${y}`),end:()=>events.push('end')}
 const ctx={device,nearest:{} as GPUSampler,linear:{} as GPUSampler,encoder:{beginComputePass:()=>{events.push('begin');return pass}} as unknown as GPUCommandEncoder}
 return{brush,modules,pipelines,writes,events,ctx,fields}
}
it('Room brush removes only unreachable paired compilation, preserving exact single WGSL/descriptor/dispatch/uniform bytes',()=>{
 vi.stubGlobal('GPUBufferUsage',{UNIFORM:1,COPY_DST:2})
 const old=fixture(false),room=fixture(true)
 expect(old.modules).toHaveLength(2);expect(room.modules).toHaveLength(1)
 expect(room.modules[0]).toEqual(old.modules[1]);expect(room.pipelines[0]).toEqual(old.pipelines[1])
 for(const f of [old,room])for(const output of ['pigment','color'] as const)f.brush.encodeSingle(f.ctx,f.fields,output,[1/16,2/16],.17,[0,0,1,1],[2,3,9,8]).forEach(b=>b.destroy())
 expect(room.writes).toEqual(old.writes);expect(room.events).toEqual(old.events);expect(room.modules).toHaveLength(1)
 // Explicit paired diagnostics still compile exactly their old program, once.
 const reflection=room.brush as unknown as {pipeline:GPUComputePipeline}
 void reflection.pipeline;void reflection.pipeline
 expect(room.modules).toHaveLength(2);expect(room.modules[1]).toEqual(old.modules[0]);expect(room.pipelines[1]).toEqual(old.pipelines[0])
})
