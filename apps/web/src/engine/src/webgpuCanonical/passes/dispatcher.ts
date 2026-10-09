import {frontSharedTileShader,frontSharedTileGeometry} from './frontSharedTile'
import {frontFilmHoistShader} from './frontFilmHoist'
import {preparedObservedFieldPipeline} from './observedFieldPreload'
import {frontSamplingShader,type CanonicalFrontSourceSampling} from './frontSampling'
import {CanonicalStaticFrontCache} from './staticFrontCache'
/// <reference types="@webgpu/types" />
import type { CanonicalGpuContext, CanonicalGpuField, CanonicalPassResources } from '../types'
import { CANONICAL_DIFFUSE_WGSL, CANONICAL_WATER_FRONT_WGSL,CANONICAL_CACHED_WATER_FRONT_WGSL,CANONICAL_CACHED_DIFFUSE_WGSL,CANONICAL_FACTOR_CACHED_WATER_FRONT_WGSL } from './kernels'
/** Pass wrappers preserve individual Q8 storage boundaries and caller order.
 * Caller retains uniform buffers until submitted work has finished. */
export class CanonicalFieldPasses {
  private readonly pipelines = new Map<string, GPUComputePipeline>()
  private filmVariants:Map<string,{staticCache:boolean;code:string;encoded:number}>|null=null
  get filmVariantDiagnostics(){return [...(this.filmVariants?.values()??[])].map(row=>({...row}))}
  private factorVariants:Map<string,{staticCache:boolean;code:string;encoded:number}>|null=null
  get factorVariantDiagnostics(){return [...(this.factorVariants?.values()??[])].map(row=>({...row}))}
  private sharedTileVariants:Map<string,{code:string;encoded:number;stride1:number;stride2:number}>|null=null
  get sharedTileVariantDiagnostics(){return [...(this.sharedTileVariants?.values()??[])].map(row=>({...row}))}
  private sourceSampler:GPUSampler|null=null
  private staticCache:CanonicalStaticFrontCache|null=null
  readonly counters = { diffuse: 0, waterFront: 0, pixels: 0 }
  private readonly device: GPUDevice
  constructor(device: GPUDevice) { this.device = device }
  retireStaticCache(defer:(cleanup:()=>void)=>void){this.staticCache?.retire(defer)}
  private pipeline(kind: 'diffuse' | 'waterFront',lazyClimb=false,staticCache=false,sourceSampling?:CanonicalFrontSourceSampling,filmHoist=false,factorCache=false,sharedTile=false) {
    let pipeline = this.pipelines.get(kind+':'+lazyClimb+':'+staticCache+':'+(sourceSampling??'legacy')+':'+filmHoist+':'+factorCache+':'+sharedTile)
    if (!pipeline) {
      let code=kind==='diffuse'?(staticCache?CANONICAL_CACHED_DIFFUSE_WGSL:CANONICAL_DIFFUSE_WGSL):frontFilmHoistShader(frontSamplingShader(staticCache?(factorCache?CANONICAL_FACTOR_CACHED_WATER_FRONT_WGSL:CANONICAL_CACHED_WATER_FRONT_WGSL):CANONICAL_WATER_FRONT_WGSL,sourceSampling),filmHoist)
      if(sharedTile)code=frontSharedTileShader(code)
      pipeline = (!sharedTile&&!lazyClimb&&!staticCache&&!sourceSampling&&!filmHoist?preparedObservedFieldPipeline(this.device,kind,kind==='diffuse'?CANONICAL_DIFFUSE_WGSL:CANONICAL_WATER_FRONT_WGSL):undefined)??this.device.createComputePipeline({ label: 'Canonical ' + kind, layout: 'auto', compute: { module: this.device.createShaderModule({ label: 'Canonical ' + kind, code }), entryPoint: 'main',constants:kind==='waterFront'?staticCache?{DIAGNOSTIC_LAZY_CLIMB:0,DIAGNOSTIC_STATIC_FRONT_CACHE:1}:{DIAGNOSTIC_LAZY_CLIMB:lazyClimb?1:0}:undefined } })
      if(filmHoist)(this.filmVariants??=new Map()).set(staticCache+':'+lazyClimb+':'+(sourceSampling??'legacy'),{staticCache,code,encoded:0})
      if(factorCache)(this.factorVariants??=new Map()).set(staticCache+':'+lazyClimb+':'+(sourceSampling??'legacy')+':'+filmHoist+(sharedTile?':sharedTile':''),{staticCache,code,encoded:0})
      if(sharedTile)(this.sharedTileVariants??=new Map()).set('factorCacheLegacy',{code,encoded:0,stride1:0,stride2:0})
      this.pipelines.set(kind+':'+lazyClimb+':'+staticCache+':'+(sourceSampling??'legacy')+':'+filmHoist+':'+factorCache+':'+sharedTile, pipeline)
    }
    return pipeline
  }
  private dispatch(ctx: CanonicalGpuContext, resources: CanonicalPassResources, kind: 'diffuse' | 'waterFront', coefficients: readonly [number, number, number, number], wet: readonly [number, number, number, number], noise?: CanonicalGpuField, foreignFilm?: CanonicalGpuField,lazyClimb=false,timestampWrites?:GPUComputePassTimestampWrites,staticCache=false,cachePrepTimestampWrites?:GPUComputePassTimestampWrites,sourceSampling?:CanonicalFrontSourceSampling,filmHoist=false,factorCache=false,sharedTileOwner?:{ownsLiveField(field:CanonicalGpuField):boolean}) {
    if (ctx.device !== this.device) throw new Error('Canonical device mismatch')
    for (const input of [resources.a, resources.coverage, resources.paper.field, foreignFilm, noise]) if (input?.texture === resources.out.texture) throw new Error('Canonical output aliases input')
    if (resources.a.width !== resources.out.width || resources.a.height !== resources.out.height || resources.coverage.width !== resources.out.width || resources.coverage.height !== resources.out.height) throw new Error('Canonical field dimensions mismatch')
    if (kind === 'waterFront' && (!noise || noise.width !== 251 || noise.height !== 251)) throw new Error('Canonical water front requires production 251x251 lattice')
    const uniforms = packPassUniforms(resources, coefficients, wet)
    const uniform = this.device.createBuffer({ label: 'Canonical ' + kind + ' uniforms', size: uniforms.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    try {
    this.device.queue.writeBuffer(uniform, 0, uniforms)
    const cache=staticCache?(this.staticCache??=new CanonicalStaticFrontCache(this.device)).getOrEncode(ctx,resources,noise!,kind==='diffuse'?[0,0,0,coefficients[2]]:coefficients,kind==='diffuse'?packPassUniforms(resources,[0,0,0,coefficients[2]],wet):uniforms,cachePrepTimestampWrites,kind==='diffuse',factorCache):null
    const sharedTile=import.meta.env.DEV&&!!sharedTileOwner&&kind==='waterFront'&&!!cache&&factorCache&&!filmHoist&&!lazyClimb&&!sourceSampling&&frontSharedTileGeometry(resources.a,resources.out,coefficients[3])&&[resources.a,resources.coverage,resources.paper.field,resources.out,noise!,...(foreignFilm?[foreignFilm]:[])].every(f=>sharedTileOwner.ownsLiveField(f))&&(resources.a.texture.usage&GPUTextureUsage.TEXTURE_BINDING)!==0&&(resources.out.texture.usage&GPUTextureUsage.STORAGE_BINDING)!==0
    const pipeline = this.pipeline(kind,lazyClimb,!!cache,sourceSampling,filmHoist,factorCache,sharedTile)
    // Auto layouts strip statically unused bindings. Diffusion has no foreign/noise.
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: resources.a.view }, { binding: 1, resource: resources.coverage.view },
      { binding: 2, resource: resources.paper.field.view },
      { binding: 5, resource: resources.out.view }, { binding: 6, resource: { buffer: uniform } },
    ]
    if (kind === 'waterFront') entries.push({ binding: 3, resource: (foreignFilm ?? resources.paper.field).view }, { binding: 4, resource: noise!.view })
    if(cache&&kind==='diffuse')entries.splice(entries.findIndex(e=>e.binding===2),1)
    if(cache)entries.push({binding:7,resource:cache})
    if(sourceSampling==='hardware')entries.push({binding:8,resource:this.sourceSampler??=this.device.createSampler({minFilter:'linear',magFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'})})
    const bind = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries })
    const pass = ctx.encoder.beginComputePass({ label: sharedTile?'Canonical waterFront shared tile':'Canonical '+kind,timestampWrites })
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind)
    pass.dispatchWorkgroups(Math.ceil(resources.out.width / 8), Math.ceil(resources.out.height / 8)); pass.end()
    if(filmHoist)this.filmVariants!.get(!!cache+':'+lazyClimb+':'+(sourceSampling??'legacy'))!.encoded++
    if(factorCache)this.factorVariants!.get(!!cache+':'+lazyClimb+':'+(sourceSampling??'legacy')+':'+filmHoist+(sharedTile?':sharedTile':''))!.encoded++
    if(sharedTile){const row=this.sharedTileVariants!.get('factorCacheLegacy')!;row.encoded++;if(coefficients[3]===1)row.stride1++;else row.stride2++}
    this.counters[kind]++; this.counters.pixels += resources.out.width * resources.out.height
    // Returned resource must be destroyed AFTER caller submits/completes encoder.
    return uniform
    } catch (error) {
      // Ownership transfers only on return; failed encoding has no caller ledger.
      try { uniform.destroy() } catch { /* Preserve the encoding error. */ }
      throw error
    }
  }
  get staticCacheCounters(){return this.staticCache?{prep:this.staticCache.prepCalls,hits:this.staticCache.hitCalls,fallbacks:this.staticCache.fallbackCalls,retainedBytes:this.staticCache.retainedBytes,cleanupFailures:this.staticCache.cleanupFailures}:null}
  diffuse(ctx: CanonicalGpuContext, resources: CanonicalPassResources, radius: number, knight: boolean, d = 0.09, b = 0.03,options:{diagnosticStaticHeightCache?:boolean;noise?:CanonicalGpuField;timestampWrites?:GPUComputePassTimestampWrites;cachePrepTimestampWrites?:GPUComputePassTimestampWrites}={}) {
    if (!(radius >= 1) || !Number.isInteger(radius)) throw new Error('Canonical diffusion radius must be prepared integer field radius')
    return this.dispatch(ctx, resources, 'diffuse', [d, b, radius, knight ? 1 : 0], [0, 0, 0, 0],options.noise,undefined,false,options.timestampWrites,options.diagnosticStaticHeightCache??false,options.cachePrepTimestampWrites)
  }
  waterFront(ctx: CanonicalGpuContext, resources: CanonicalPassResources, noise: CanonicalGpuField, params: { dryCost: number; costMax: number; climb: number; floor: number; stride: number; foreignFilm?: CanonicalGpuField;diagnosticSourceFilter?:CanonicalFrontSourceSampling;diagnosticSharedTileOwner?:{ownsLiveField(field:CanonicalGpuField):boolean};diagnosticLazyClimb?:boolean;diagnosticFilmHoist?:boolean;timestampWrites?:GPUComputePassTimestampWrites;diagnosticStaticCache?:boolean;diagnosticStaticCacheFactor?:boolean;cachePrepTimestampWrites?:GPUComputePassTimestampWrites }) {
    if (!(params.costMax > 0) || !(params.stride >= 1)) throw new Error('Canonical front invalid cost/stride')
    return this.dispatch(ctx, resources, 'waterFront', [params.climb, params.floor, params.costMax, params.stride], [params.dryCost, params.foreignFilm ? 1 : 0, params.diagnosticSourceFilter&&resources.a.filter==='linear'?1:0, 0], noise, params.foreignFilm,params.diagnosticLazyClimb??false,params.timestampWrites,params.diagnosticStaticCache??false,params.cachePrepTimestampWrites,params.diagnosticSourceFilter,import.meta.env.DEV&&params.diagnosticFilmHoist===true,import.meta.env.DEV&&params.diagnosticStaticCache===true&&params.diagnosticStaticCacheFactor===true,params.diagnosticSharedTileOwner)
  }
}
export function packPassUniforms(resources: CanonicalPassResources, coefficients: readonly [number, number, number, number], wet: readonly [number, number, number, number]) {
  const values = new Float32Array(16)
  values.set([resources.out.width, resources.out.height, ...resources.paper.origin, ...resources.paper.texSize, resources.paper.scale, resources.paper.scale, ...coefficients, ...wet])
  if (values.some(value => !Number.isFinite(value))) throw new Error('Canonical pass uniforms must be finite')
  if (resources.paper.texSize.some(value => value <= 0)) throw new Error('Canonical paper world size must be positive')
  return values
}
