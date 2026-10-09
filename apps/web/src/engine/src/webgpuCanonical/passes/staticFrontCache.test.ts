import {afterEach,expect,it,vi} from 'vitest'
import {CanonicalStaticFrontCache} from './staticFrontCache'
import type {CanonicalGpuContext,CanonicalPassResources,CanonicalGpuField} from '../types'
afterEach(()=>vi.unstubAllGlobals())
function fixture(){
 vi.stubGlobal('GPUTextureUsage',{STORAGE_BINDING:1,TEXTURE_BINDING:2});vi.stubGlobal('GPUBufferUsage',{UNIFORM:1,COPY_DST:2})
 let lose!:()=>void;const textures:{destroy:ReturnType<typeof vi.fn>;createView:ReturnType<typeof vi.fn>}[]=[],buffers:{destroy:ReturnType<typeof vi.fn>}[]=[]
 const device={lost:new Promise<void>(resolve=>{lose=resolve}),queue:{writeBuffer:vi.fn()},createTexture:vi.fn(()=>{const t={destroy:vi.fn(),createView:vi.fn(()=>({}))};textures.push(t);return t}),createBuffer:vi.fn(()=>{const b={destroy:vi.fn()};buffers.push(b);return b}),createComputePipeline:vi.fn(()=>({getBindGroupLayout:()=>({})})),createShaderModule:vi.fn(()=>({})),createBindGroup:vi.fn(()=>({}))} as unknown as GPUDevice
 const pass={setPipeline:vi.fn(),setBindGroup:vi.fn(),dispatchWorkgroups:vi.fn(),end:vi.fn()},encoder={beginComputePass:vi.fn(()=>pass)} as unknown as GPUCommandEncoder
 const makeField=(w=1536,h=1536)=>({width:w,height:h,texture:{},view:{},filter:'nearest',format:'rgba8unorm',label:'fixture'}) as CanonicalGpuField
 const field=makeField(),noise=makeField(251,251),resources={out:field,a:makeField(),b:makeField(),coverage:makeField(),paper:{field:makeField(2048,2048),origin:[0,-1536],texSize:[1754,2480],scale:1,staticInputEpoch:'1:1'},world:{x:0,y:0,width:1536,height:1536}} as CanonicalPassResources
 const ctx={device,encoder} as CanonicalGpuContext,cache=new CanonicalStaticFrontCache(device)
 const run=(r=resources,c:[number,number,number,number]=[30,.85,164,1],context=ctx)=>cache.getOrEncode(context,r,noise,c,new Float32Array(20))
 return{cache,run,resources,ctx,device,textures,buffers,pass,lose}
}
it('exact static read-set hits once; dynamic cost/floor differences do not invalidate it',()=>{const f=fixture();f.run();f.run(f.resources,[30,1,9,1]);expect(f.cache.prepCalls).toBe(1);expect(f.cache.hitCalls).toBe(1);expect(f.textures).toHaveLength(1);f.cache.destroy()})
it('mutation epoch, geometry and climb cannot produce false hits',()=>{const f=fixture();f.run();for(const r of [{...f.resources,paper:{...f.resources.paper,staticInputEpoch:'2:1'}},{...f.resources,paper:{...f.resources.paper,origin:[1,-1536] as const}}])expect(f.run(r)).toBeNull();expect(f.run(f.resources,[15,.85,164,1])).toBeNull();expect(f.cache.hitCalls).toBe(0);f.cache.destroy()})
it('bounds, unsupported epoch, device mismatch and aliases fail before allocation',()=>{const f=fixture();expect(f.run({...f.resources,paper:{...f.resources.paper,staticInputEpoch:undefined}})).toBeNull();expect(f.run({...f.resources,out:{...f.resources.out,width:1537}})).toBeNull();expect(()=>f.run(f.resources,undefined,{...f.ctx,device:{} as GPUDevice})).toThrow(/device/);expect(()=>f.run({...f.resources,out:f.resources.paper.field})).toThrow(/aliases/);expect(f.textures).toHaveLength(0);f.cache.destroy()})
it('retire detaches cache immediately and destroys only through existing ACK callback',()=>{const f=fixture();f.run();let ack:(()=>void)|undefined;f.cache.retire(cleanup=>{ack=cleanup});expect(f.textures[0].destroy).not.toHaveBeenCalled();expect(f.run()).toBeNull();expect(f.cache.prepCalls).toBe(1);expect(f.cache.retainedBytes).toBe(18*1024*1024);ack!();ack!();expect(f.cache.retainedBytes).toBe(0);f.run();expect(f.cache.prepCalls).toBe(2);expect(f.textures[0].destroy).toHaveBeenCalledOnce();expect(f.buffers[0].destroy).toHaveBeenCalledOnce();expect(f.textures[1].destroy).not.toHaveBeenCalled();f.cache.destroy()})
it('encoding failure destroys created resources and leaves no HIT',()=>{const f=fixture();vi.spyOn(f.ctx.encoder,'beginComputePass').mockImplementationOnce(()=>{throw Error('encode failed')});expect(()=>f.run()).toThrow('encode failed');expect(f.textures[0].destroy).toHaveBeenCalledOnce();expect(f.buffers[0].destroy).toHaveBeenCalledOnce();f.run();expect(f.cache.prepCalls).toBe(1);f.cache.destroy()})
it('device loss closes cache without reallocating',async()=>{const f=fixture();f.run();f.lose();await Promise.resolve();expect(()=>f.run()).toThrow(/unavailable/);expect(f.textures[0].destroy).toHaveBeenCalledOnce();expect(f.textures).toHaveLength(1)})

it('buffer allocation rejection retires the preceding texture',()=>{const f=fixture();vi.spyOn(f.device,'createBuffer').mockImplementationOnce(()=>{throw Error('allocation failed')});expect(()=>f.run()).toThrow('allocation failed');expect(f.textures[0].destroy).toHaveBeenCalledOnce();expect(f.buffers).toHaveLength(0);f.cache.destroy()})
it('factor cache reuses 0/20/30 but never aliases the scaled variant or stale paper',()=>{
 const f=fixture();const run=(climb:number,r=f.resources)=>f.cache.getOrEncode(f.ctx,r,{width:251,height:251,texture:noiseTexture,view:{}} as CanonicalGpuField,[climb,.85,164,1],new Float32Array(20),undefined,false,true);const noiseTexture={} as GPUTexture
 run(30);run(0);run(-0);run(20);expect(f.cache.prepCalls).toBe(1);expect(f.cache.hitCalls).toBe(3)
 expect(run(20,{...f.resources,paper:{...f.resources.paper,staticInputEpoch:'new'}})).toBeNull()
 expect(f.cache.getOrEncode(f.ctx,f.resources,{width:251,height:251,texture:noiseTexture,view:{}} as CanonicalGpuField,[30,.85,164,1],new Float32Array(20))).toBeNull()
 let ack!:()=>void;f.cache.retire(release=>{ack=release});expect(run(20)).toBeNull();expect(f.cache.retainedBytes).toBe(18*1024*1024);expect(f.textures).toHaveLength(1);ack();run(20);expect(f.textures).toHaveLength(2);f.cache.destroy()
})
