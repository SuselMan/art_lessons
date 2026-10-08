/// <reference types="@webgpu/types" />
import type { CanonicalGpuContext, CanonicalGpuField, CanonicalPassResources } from '../types'
import { CANONICAL_DIFFUSE_WGSL, CANONICAL_WATER_FRONT_WGSL } from './kernels'
/** Pass wrappers preserve individual Q8 storage boundaries and caller order.
 * Caller retains uniform buffers until submitted work has finished. */
export class CanonicalFieldPasses {
  private readonly pipelines = new Map<string, GPUComputePipeline>()
  readonly counters = { diffuse: 0, waterFront: 0, pixels: 0 }
  private readonly device: GPUDevice
  constructor(device: GPUDevice) { this.device = device }
  private pipeline(kind: 'diffuse' | 'waterFront',lazyClimb=false) {
    let pipeline = this.pipelines.get(kind+':'+lazyClimb)
    if (!pipeline) {
      pipeline = this.device.createComputePipeline({ label: 'Canonical ' + kind, layout: 'auto', compute: { module: this.device.createShaderModule({ label: 'Canonical ' + kind, code: kind === 'diffuse' ? CANONICAL_DIFFUSE_WGSL : CANONICAL_WATER_FRONT_WGSL }), entryPoint: 'main',constants:kind==='waterFront'?{DIAGNOSTIC_LAZY_CLIMB:lazyClimb?1:0}:undefined } })
      this.pipelines.set(kind+':'+lazyClimb, pipeline)
    }
    return pipeline
  }
  private dispatch(ctx: CanonicalGpuContext, resources: CanonicalPassResources, kind: 'diffuse' | 'waterFront', coefficients: readonly [number, number, number, number], wet: readonly [number, number, number, number], noise?: CanonicalGpuField, foreignFilm?: CanonicalGpuField,lazyClimb=false,timestampWrites?:GPUComputePassTimestampWrites) {
    if (ctx.device !== this.device) throw new Error('Canonical device mismatch')
    for (const input of [resources.a, resources.coverage, resources.paper.field, foreignFilm, noise]) if (input?.texture === resources.out.texture) throw new Error('Canonical output aliases input')
    if (resources.a.width !== resources.out.width || resources.a.height !== resources.out.height || resources.coverage.width !== resources.out.width || resources.coverage.height !== resources.out.height) throw new Error('Canonical field dimensions mismatch')
    if (kind === 'waterFront' && (!noise || noise.width !== 251 || noise.height !== 251)) throw new Error('Canonical water front requires production 251x251 lattice')
    const uniforms = packPassUniforms(resources, coefficients, wet)
    const uniform = this.device.createBuffer({ label: 'Canonical ' + kind + ' uniforms', size: uniforms.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.device.queue.writeBuffer(uniform, 0, uniforms)
    const pipeline = this.pipeline(kind,lazyClimb)
    // Auto layouts strip statically unused bindings. Diffusion has no foreign/noise.
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: resources.a.view }, { binding: 1, resource: resources.coverage.view },
      { binding: 2, resource: resources.paper.field.view },
      { binding: 5, resource: resources.out.view }, { binding: 6, resource: { buffer: uniform } },
    ]
    if (kind === 'waterFront') entries.push({ binding: 3, resource: (foreignFilm ?? resources.paper.field).view }, { binding: 4, resource: noise!.view })
    const bind = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries })
    const pass = ctx.encoder.beginComputePass({ label: 'Canonical ' + kind,timestampWrites })
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind)
    pass.dispatchWorkgroups(Math.ceil(resources.out.width / 8), Math.ceil(resources.out.height / 8)); pass.end()
    this.counters[kind]++; this.counters.pixels += resources.out.width * resources.out.height
    // Returned resource must be destroyed AFTER caller submits/completes encoder.
    return uniform
  }
  diffuse(ctx: CanonicalGpuContext, resources: CanonicalPassResources, radius: number, knight: boolean, d = 0.09, b = 0.03) {
    if (!(radius >= 1) || !Number.isInteger(radius)) throw new Error('Canonical diffusion radius must be prepared integer field radius')
    return this.dispatch(ctx, resources, 'diffuse', [d, b, radius, knight ? 1 : 0], [0, 0, 0, 0])
  }
  waterFront(ctx: CanonicalGpuContext, resources: CanonicalPassResources, noise: CanonicalGpuField, params: { dryCost: number; costMax: number; climb: number; floor: number; stride: number; foreignFilm?: CanonicalGpuField;diagnosticLazyClimb?:boolean;timestampWrites?:GPUComputePassTimestampWrites }) {
    if (!(params.costMax > 0) || !(params.stride >= 1)) throw new Error('Canonical front invalid cost/stride')
    return this.dispatch(ctx, resources, 'waterFront', [params.climb, params.floor, params.costMax, params.stride], [params.dryCost, params.foreignFilm ? 1 : 0, 0, 0], noise, params.foreignFilm,params.diagnosticLazyClimb??false,params.timestampWrites)
  }
}
export function packPassUniforms(resources: CanonicalPassResources, coefficients: readonly [number, number, number, number], wet: readonly [number, number, number, number]) {
  const values = new Float32Array(16)
  values.set([resources.out.width, resources.out.height, ...resources.paper.origin, ...resources.paper.texSize, resources.paper.scale, resources.paper.scale, ...coefficients, ...wet])
  if (values.some(value => !Number.isFinite(value))) throw new Error('Canonical pass uniforms must be finite')
  if (resources.paper.texSize.some(value => value <= 0)) throw new Error('Canonical paper world size must be positive')
  return values
}
