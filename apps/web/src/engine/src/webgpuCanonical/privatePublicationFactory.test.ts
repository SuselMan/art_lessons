import {afterEach,expect,it,vi} from 'vitest'
import {PrivatePublicationFactory} from './privatePublicationFactory'
afterEach(()=>vi.unstubAllGlobals())
function fixture(){
 vi.stubGlobal('GPUTextureUsage',{RENDER_ATTACHMENT:1,COPY_SRC:2})
 const commands:Array<()=>void>=[],acks:Array<{resolve:()=>void;reject:(e:Error)=>void}>=[],canvases:any[]=[],bindings:any[]=[],trace:string[]=[]
 const device:any={createShaderModule:()=>({}),createRenderPipeline:()=>({getBindGroupLayout:()=>({})}),createBindGroup:(d:any)=>{const b={field:d.entries[0].resource};bindings.push(b);return b},
 createCommandEncoder:()=>{let canvas:any,binding:any;return{beginRenderPass:(d:any)=>{canvas=d.colorAttachments[0].view.canvas;return{setPipeline(){},setBindGroup:(_i:any,b:any)=>{binding=b},draw:(n:number)=>{expect(n).toBe(3)},end(){}}},finish:()=>()=>{canvas.value=binding.field.value;trace.push('copy:'+canvas.id)}}},
 queue:{submit:(c:any[])=>commands.push(...c),onSubmittedWorkDone:()=>new Promise<void>((resolve,reject)=>acks.push({resolve,reject}))}}
 const createCanvas=()=>{const c:any={id:canvases.length,value:-1,width:0,height:0};const ctx={configure:(d:any)=>{expect(d.format).toBe('rgba8unorm');expect(d.alphaMode).toBe('premultiplied')},getCurrentTexture:()=>({createView:()=>({canvas:c})}),unconfigure:()=>trace.push('unconfigure:'+c.id)};c.getContext=()=>ctx;canvases.push(c);return c}
 const factory=new PrivatePublicationFactory(device,1024,1024,createCanvas),field:any={width:1024,height:1024,view:{value:1}},imports:number[]=[]
 const target:any={width:1024,height:1024,restoreCanvasPixels:(c:any)=>{imports.push(c.value);trace.push('import:'+c.id)}}
 return{factory,field,target,canvases,acks,trace,imports,commands,flush(){while(commands.length)commands.shift()!()}}
}
it('actual raw bridge copies separate private canvases with existing ACK and holds lease through GL import',async()=>{
 const f=fixture(),a=f.factory.acquire(),old=a.publish(f.field,f.target,()=>true)
 expect(()=>f.factory.acquire().abandon()).not.toThrow();const b=f.factory.acquire()
 expect(()=>f.factory.acquire()).toThrow('capacity')
 f.flush();f.field.view.value=2;const next=b.publish(f.field,f.target,()=>true);f.flush()
 expect(f.canvases.map(c=>c.value)).toEqual([1,2]);expect(f.imports).toEqual([])
 f.acks[0].resolve();await old;expect(f.imports).toEqual([1]);f.acks[1].resolve();await next;expect(f.imports).toEqual([1,2])
 expect(f.acks).toHaveLength(2);expect(f.factory.logicalMaxBytes).toBe(8388608)
 f.factory.dispose();expect(f.trace.filter(x=>x.startsWith('unconfigure'))).toHaveLength(2)
})
it('dispose/owner invalidation and ACK rejection release without importing or extra ACK',async()=>{
 const f=fixture(),a=f.factory.acquire(),held=a.publish(f.field,f.target,()=>true),rejected=expect(held).rejects.toThrow('retired');f.flush();f.factory.dispose()
 expect(f.trace).not.toContain('unconfigure:0');f.acks[0].resolve();await rejected
 expect(f.imports).toEqual([]);expect(f.trace).toContain('unconfigure:0');expect(()=>f.factory.acquire()).toThrow('disposed')
 const g=fixture(),b=g.factory.acquire(),err=Error('ACK failed'),failed=b.publish(g.field,g.target,()=>true),failure=expect(failed).rejects.toBe(err);g.acks[0].reject(err);await failure;expect(g.imports).toEqual([]);g.factory.acquire().abandon();g.factory.dispose()
 const j=fixture(),d=j.factory.acquire(),importError=Error('import failed');j.target.restoreCanvasPixels=()=>{throw importError};const importing=d.publish(j.field,j.target,()=>true),importFailure=expect(importing).rejects.toBe(importError);j.flush();j.acks[0].resolve();await importFailure;j.factory.acquire().abandon();j.factory.dispose()
 const h=fixture(),c=h.factory.acquire();let current=true;const stale=c.publish(h.field,h.target,()=>current),staleFailure=expect(stale).rejects.toThrow('retired');current=false;h.flush();h.acks[0].resolve();await staleFailure;expect(h.imports).toEqual([]);h.factory.dispose()
})
it('budget and single-use guard hold before any new GPU canvas',async()=>{
 expect(()=>new PrivatePublicationFactory({} as any,1025,1024,()=>{throw Error('must not create')})).toThrow('budget')
 const f=fixture(),a=f.factory.acquire();a.abandon();await expect(a.publish(f.field,f.target,()=>true)).rejects.toThrow('consumed');expect(f.acks).toHaveLength(0);f.factory.dispose()
})

it('rejects a canvasFactory returning the same destination for overlapping leases',()=>{
 const f=fixture(),original=f.factory.acquire(),same=new PrivatePublicationFactory((f.factory as any).device,1024,1024,()=>original.canvas);same.acquire();expect(()=>same.acquire()).toThrow('aliases');same.dispose();original.abandon();f.factory.dispose()
})
