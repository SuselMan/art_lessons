/// <reference types="@webgpu/types" />
import type { CanonicalGpuContext, CanonicalPassResources } from '../types'
export type BasicFieldMode = 0 | 1 | 2 | 3 | 4 | 5 | 20
export const CANONICAL_BASIC_FIELD_WGSL = `
struct Params { dims:vec2f, dir:vec2f, tau:vec4f, scalars:vec4f, scissor:vec4f }
@group(0) @binding(0) var aTex:texture_2d<f32>;
@group(0) @binding(1) var bTex:texture_2d<f32>;
@group(0) @binding(2) var cTex:texture_2d<f32>;
@group(0) @binding(3) var outTex:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(4) var<uniform> u:Params;
fn sample(t:texture_2d<f32>,uv:vec2f)->vec4f {
 let dims=vec2i(textureDimensions(t));let q=clamp(vec2i(floor(uv*vec2f(dims))),vec2i(0),dims-vec2i(1));
 return textureLoad(t,vec2i(q.x,dims.y-1-q.y),0);
}
fn fit(v:vec4f)->vec4f { return v/max(1.0,max(max(v.r,v.g),max(v.b,v.a))); }
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u) {
 let q=tid.xy;if(any(q>=vec2u(u.dims))){return;}
 let px=vec2f(f32(q.x)+0.5,u.dims.y-f32(q.y)-0.5);
 // Scissor is canonical bottom-up GL x/y/w/h; untouched destination stays intact.
 if(any(px<u.scissor.xy)||any(px>=u.scissor.xy+u.scissor.zw)){return;}
 let uv=px/u.dims;let a=sample(aTex,uv);let b=sample(bTex,uv);let k=u.scalars.x;let mode=u.scalars.y;var value=vec4f(0);
 if(mode<0.5){value=max(a-b,vec4f(0))*k;}
 else if(mode<1.5){value=fit(a+b*k);}
 else if(mode<2.5){value=vec4f(a.b*u.tau.xyz/4.0,a.b);}
 else if(mode<3.5){value=clamp(a+b-sample(cTex,uv),vec4f(0),vec4f(1));}
 else if(mode<4.5){value=vec4f(smoothstep(k,k*4.0,a.a*2.0),0,0,1);}
 else if(mode<5.5){
  var s=vec4f(0);
  for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){
   var wx=1.0;var wy=1.0;if(i==0){wx=2;}if(j==0){wy=2;}
   s+=wx*wy*sample(aTex,uv+vec2f(f32(i),f32(j))*u.dir);
  }}value=s/16.0;
 }else{value=max(a,b);}
 textureStore(outTex,vec2i(q),value);
}
`;
export class CanonicalBasicFieldPass {
  private pipeline: GPUComputePipeline | null = null
  private readonly device: GPUDevice
  constructor(device: GPUDevice) { this.device = device }
  run(ctx: CanonicalGpuContext, resources: CanonicalPassResources, mode: BasicFieldMode, k: number, opts: { dir?: readonly [number, number]; tau?: readonly [number, number, number]; scissor?: readonly [number, number, number, number]; world?: readonly [number, number, number] } = {}) {
    if (![0,1,2,3,4,5,20].includes(mode)) throw new Error('Canonical field mode not yet ported')
    if (mode === 1 && (opts.world?.[2] ?? 0) > 0) throw new Error('Canonical fibre/comb mode1 pending; cannot silently use plain addition')
    for (const field of [resources.a, resources.b, resources.c]) if (field?.texture === resources.out.texture) throw new Error('Canonical output aliases sampled field')
    if (ctx.device !== this.device) throw new Error('Canonical device mismatch')
    if (!this.pipeline) this.pipeline = this.device.createComputePipeline({ label: 'Canonical basic field', layout: 'auto', compute: { module: this.device.createShaderModule({ code: CANONICAL_BASIC_FIELD_WGSL }), entryPoint: 'main' } })
    const values=new Float32Array(16), w=resources.out.width, h=resources.out.height
    values.set([w,h,(opts.dir?.[0]??0)/w,(opts.dir?.[1]??0)/h,...(opts.tau??[0,0,0]),0,k,mode,0,0,...(opts.scissor??[0,0,w,h])])
    // Four aligned vec4 slots: one immutable uniform allocation per dispatch.
    const uniform=this.device.createBuffer({ size:64, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST })
    this.device.queue.writeBuffer(uniform,0,values.subarray(0,16))
    const bind=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[
      {binding:0,resource:resources.a.view},{binding:1,resource:resources.b.view},{binding:2,resource:(resources.c??resources.b).view},
      {binding:3,resource:resources.out.view},{binding:4,resource:{buffer:uniform}},
    ]})
    const pass=ctx.encoder.beginComputePass({label:import.meta.env.DEV?'Canonical basic fieldOp '+mode:'Canonical fieldOp '+mode});pass.setPipeline(this.pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(w/8),Math.ceil(h/8));pass.end()
    return uniform
  }
}
