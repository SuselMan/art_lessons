import type { CanonicalGpuContext, CanonicalGpuField, CanonicalPassResources } from '../types'
import { CanonicalFieldPasses } from './dispatcher'
import { CanonicalFieldOps, type CanonicalFieldOptions } from './fieldOps'
import { CanonicalCostDomainPass } from './costDomain'
import { CanonicalResamplePass } from './resample'
/** Prepared production command stream. This is not a new physical schedule.
 * CPU producer must retain original iteration/stride/pass/scissor sequence. */
export type CanonicalSettleCommand =
 | { kind:'fieldOp'; resources:CanonicalPassResources; mode:number; k:number; options?:CanonicalFieldOptions }
 | { kind:'pigmentColor'; resources:CanonicalPassResources; tau:readonly[number,number,number] }
 | { kind:'diffuse'; resources:CanonicalPassResources; radius:number; knight:boolean; d?:number; b?:number;options?:Parameters<CanonicalFieldPasses['diffuse']>[6] }
 | { kind:'waterFront'; resources:CanonicalPassResources; noise:CanonicalGpuField; params:Parameters<CanonicalFieldPasses['waterFront']>[3] }
 | { kind:'costDomain'; out:CanonicalGpuField; source:CanonicalGpuField; rect:readonly[number,number,number,number]; band:number; stride:number; packed?:boolean }
 | { kind:'resample'; out:CanonicalGpuField; source:CanonicalGpuField; old:CanonicalGpuField; base:CanonicalGpuField; params:Parameters<CanonicalResamplePass['run']>[5] }
export class CanonicalSettleCommands {
 private readonly fields:CanonicalFieldOps
 private readonly transport:CanonicalFieldPasses
 private readonly domain:CanonicalCostDomainPass
 private readonly resample:CanonicalResamplePass
 constructor(device:GPUDevice){this.fields=new CanonicalFieldOps(device);this.transport=new CanonicalFieldPasses(device);this.domain=new CanonicalCostDomainPass(device);this.resample=new CanonicalResamplePass(device)}
 get staticFrontCacheCounters(){return this.transport.staticCacheCounters}
 /** Encode exactly one original GPU primitive; caller owns scheduling and cleanup. */
 encode(ctx:CanonicalGpuContext,command:CanonicalSettleCommand):GPUBuffer{
  switch(command.kind){
   case 'fieldOp':return this.fields.run(ctx,command.resources,command.mode,command.k,command.options)
   case 'pigmentColor':return this.fields.run(ctx,{...command.resources,b:command.resources.a,c:command.resources.a},2,1,{c:command.resources.a,d:command.resources.a,tau:command.tau})
   case 'diffuse':return this.transport.diffuse(ctx,command.resources,command.radius,command.knight,command.d,command.b,command.options)
   case 'waterFront':return this.transport.waterFront(ctx,command.resources,command.noise,command.params)
   case 'costDomain':return this.domain.run(ctx,command.out,command.source,command.rect,command.band,command.stride,command.packed)
   case 'resample':return this.resample.run(ctx,command.out,command.source,command.old,command.base,command.params)
  }
 }
}
