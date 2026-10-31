import { reserveContextStorage, releaseStorageReservation } from '../buffers/ContextStorageOwner'
import { sourcePngPyramid, type BrushTip, type TipMaskId, type CanonicalMaterialAsset } from '@grafetto/shared'
import { nativeImageBank, nativeImagePixels, type NativeImageResource } from './NativeImageBank'
import { BrushTextureCache, uploadBrushTexture, releaseUnpublishedBrushResource, type OwnedBrushResource } from './BrushTextureCache'
import { BrushMipCache } from './BrushMipCache'
import type { TransformedMaskSource, TransformedMaskPreparedSource } from './TransformedMaskPrepass'

/** Trusted imageSampling provenance: original opaque grayscale, unchanged crop.
 * Coverage with unknown original alpha/material conversion is NOT this input. */
export interface CanonicalMaskSourceInput {
  readonly id: TipMaskId
  readonly tip: BrushTip
  readonly assetSide: number
  readonly readOriginalCoverage: () => Uint8Array
}
export interface CanonicalMaskSourceJob {
  readonly key: string
  readonly resource: NativeImageResource
  readonly bytes: number
  readonly transientCpuBytes: number
}
export interface CanonicalMaskCompanionBudget { readonly gpuBytes: number; readonly cpuBytes: number }
const integer = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min
const JOB_METADATA_BYTES = 512

/** Existing nativeImagePixels may simultaneously hold croppedN, brightnessN,
 * scaledM, borderedL8B. After nativeImagePixels RETURNS, crop/brightness/scaled/
 * axis locals are unreachable; expansion then holds borderedL8B+RGBA4B.
 * Charge the MAX of those phases, not their sum. Deferred GC is not a bounded
 * heap guarantee; this cache budget accounts reachable working sets.
 * The resize axes contain number
 * arrays, per-destination sample objects/weight arrays and original axis tables.
 * Reduction has at most S+2D weights; enlargement at most2D. Charge512 bytes per
 * source/destination axis unit, conservatively above their JS object/array slots.
 * This is a budget estimate, not a claim about a particular JS heap allocator. */
function transientBytes(resource: NativeImageResource): number {
  const { width, height } = resource.rect
  const n = width * height, m = resource.nativeWidth * resource.nativeHeight
  const b = resource.width * resource.height
  const generation = 2 * n + m + b + 512 * (width + height + resource.nativeWidth + resource.nativeHeight + 8)
  return Math.max(generation, 5 * b)
}

/** Finite source bank only. No active painter/descriptor hooks or new allowance.
 * Every reachable level is planned before reading/cropping/resizing any image.
 * Caller schedules one prepareJob per existing BrushPreparation job/frame. */
export class CanonicalMaskSourceBank {
  readonly jobs: readonly CanonicalMaskSourceJob[]
  readonly gpuBytes: number
  readonly maximumTransientCpuBytes: number
  readonly metadataCpuBytes: number
  private readonly inputs = new Map<string, Readonly<Pick<CanonicalMaskSourceInput,'assetSide'|'readOriginalCoverage'>>>()
  private readonly owned = new Set<string>()
  private readonly gl: WebGLRenderingContext
  private readonly cache: BrushTextureCache
  private readonly cpu: BrushMipCache
  private readonly companion: CanonicalMaskCompanionBudget
  private releaseMetadata?: () => void
  private generation = 0
  private readonly originalOwner=this
  private readonly ownerProof:Readonly<{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache}>

  constructor(gl: WebGLRenderingContext, cache: BrushTextureCache, cpu: BrushMipCache,
    inputs: readonly CanonicalMaskSourceInput[], companion: CanonicalMaskCompanionBudget) {
    this.gl = gl; this.cache = cache; this.cpu = cpu
    this.ownerProof=Object.freeze({gl,cache,cpu})
    if (!companion || !integer(companion.gpuBytes) || !integer(companion.cpuBytes)
      || !Array.isArray(inputs) || inputs.length < 1 || inputs.length > 256) throw new RangeError('Invalid canonical bank plan')
    this.companion = { ...companion }
    const jobs = new Map<string, CanonicalMaskSourceJob>()
    for (const input of inputs) {
      const policy = input.tip?.imageSampling, rect = policy?.sourceRect
      if (typeof input.id !== 'string' || !input.id || input.tip.kind !== 'bitmap' || input.tip.material || !policy
        || policy.kind !== 'integer-pyramid' || policy.signal !== 'inverse-gray'
        || !rect || !integer(input.assetSide, 1) || input.assetSide > 4096
        || !integer(rect.x) || !integer(rect.y) || !integer(rect.width, 1) || !integer(rect.height, 1)
        || rect.x + rect.width > input.assetSide || rect.y + rect.height > input.assetSide
        || typeof input.readOriginalCoverage !== 'function') throw new RangeError('Canonical source requires opaque grayscale provenance')
      for (const originalResource of nativeImageBank(input.id, input.tip)) {
        const resource = Object.freeze({ ...originalResource, rect: Object.freeze({ ...originalResource.rect }), bounds: Object.freeze({ ...originalResource.bounds }) })
        const key = `canonical-mask:straight-gray-rgba8:${resource.key}`
        const job = Object.freeze({ key, resource, bytes: resource.width * resource.height * 4, transientCpuBytes: transientBytes(resource) })
        if (!jobs.has(key)) { jobs.set(key, job); this.inputs.set(key,Object.freeze({assetSide:input.assetSide,readOriginalCoverage:input.readOriginalCoverage})) }
      }
    }
    this.jobs = Object.freeze([...jobs.values()])
    this.gpuBytes = this.jobs.reduce((sum, job) => sum + job.bytes, 0)
    this.maximumTransientCpuBytes = Math.max(...this.jobs.map(job => job.transientCpuBytes))
    this.metadataCpuBytes = JOB_METADATA_BYTES * this.jobs.length
    const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    if (!integer(maximum, 1) || !this.jobs.length || this.jobs.length > 4096 || !integer(this.gpuBytes)
      || this.gpuBytes + companion.gpuBytes > cache.budgetBytes
      || this.metadataCpuBytes + this.maximumTransientCpuBytes + companion.cpuBytes > cpu.budgetBytes
      || this.jobs.some(job => job.resource.width > maximum || job.resource.height > maximum
        || job.resource.nativeWidth > 4096 || job.resource.nativeHeight > 4096
        || job.resource.width * job.resource.height > 4 * 1024 * 1024))
      throw new RangeError('Canonical source bank exceeds existing brush budgets')
  }

  /** Cold binding of an already normalized original snapshot asset. No pixels,
   * GL queries or new source authority; inspect the finite immutable plan once. */
  assertSourceBinding(asset:CanonicalMaterialAsset,owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache}):number {
    const generation=this.generation
    this.assertCurrentOwners(generation)
    if(owners.gl!==this.gl||owners.cache!==this.cache||owners.cpu!==this.cpu||!this.isReady())throw new Error('Canonical bank owner/source unavailable')
    const sources=this.preparedResources().filter(s=>s.canonical&&['id','size','x','y','width','height'].every(k=>s.canonical!.asset[k as keyof CanonicalMaterialAsset]===asset[k as keyof CanonicalMaterialAsset]))
    if(!sources.length)throw new Error('Canonical bank asset binding missing')
    const levels=sourcePngPyramid(asset.width,asset.height).levels
    if(sources.length!==levels.length)throw new Error('Canonical bank levels incomplete')
    for(const [index,level] of levels.entries()){
      const matches=sources.filter(s=>s.canonical!.index===index),source=matches[0],m=source?.canonical
      if(matches.length!==1||!m||m.baseScale!==level.scale||m.nativeWidth!==level.width||m.nativeHeight!==level.height
        ||source.bytes!==level.storedWidth*level.storedHeight*4)throw new Error('Canonical bank level binding mismatch')
    }
    this.assertCurrentOwners(generation)
    return generation
  }
  /** Hot original-owner/generation check. No resource scan, arrays or GL calls.
   * Actual cache handles/bindings remain executor/prepass-owned checks on use. */
  assertCurrentOwners(generation:number):void {
    if(this.originalOwner!==this||this.gl!==this.ownerProof.gl||this.cache!==this.ownerProof.cache||this.cpu!==this.ownerProof.cpu
      ||generation!==this.generation||!this.releaseMetadata)throw new Error('Canonical bank owner/generation changed')
  }

  /** No CPU image bytes retained here: only the existing bounded L8 mip cache. */
  prepareJob(index: number, signal?: AbortSignal): 'ready' | 'cancelled' {
    if (signal?.aborted) return 'cancelled'
    if (!integer(index) || index >= this.jobs.length) throw new RangeError('Invalid canonical source job')
    const job = this.jobs[index], existing = this.cache.get(job.key)
    if (existing && this.cache.resourceBytes(job.key) !== job.bytes) throw new Error('Conflicting canonical source cache entry')
    const extraMetadata = this.releaseMetadata ? 0 : this.metadataCpuBytes
    if (this.cpu.reservedBytes + extraMetadata + (existing ? 0 : job.transientCpuBytes + this.companion.cpuBytes) > this.cpu.budgetBytes)
      throw new RangeError('Canonical source job exceeds the shared CPU budget')
    if(existing){if(!this.releaseMetadata)this.releaseMetadata=this.cpu.reserve(this.metadataCpuBytes);return 'ready'}
    const storage=reserveContextStorage(this.gl,job.bytes,'brush-texture-rgba-equivalent')
    let releaseCpu=()=>{},releaseGpu=()=>{},restoreSource:(()=>void)|undefined,uploaded:OwnedBrushResource|undefined
    let failed=false,failure:unknown,result:'ready'|'cancelled'='cancelled'
    const attempt=(cleanup:()=>void)=>{try{cleanup()}catch(error){if(!failed){failed=true;failure=error}}}
    try {
      if(!this.releaseMetadata){this.releaseMetadata=this.cpu.reserve(this.metadataCpuBytes)}
      releaseCpu=this.cpu.reserve(job.transientCpuBytes+this.companion.cpuBytes)
      const resources=this.jobs.map(({key,bytes})=>({key,bytes}))
      this.cache.protect(resources.map(item=>item.key));releaseGpu=this.cache.lease(resources)
      const generation=this.generation
      result=(()=>{
      const input = this.inputs.get(job.key)!, original = input.readOriginalCoverage()
      if (!(original instanceof Uint8Array) || original.length !== input.assetSide * input.assetSide)
        throw new RangeError('Canonical source asset layout changed')
      if (signal?.aborted || generation !== this.generation) return 'cancelled'
      const level = this.cpu.get(job.resource.key, () => [nativeImagePixels(job.resource, original)])[0]
      const { width, height } = job.resource
      if (level.length !== width * height) throw new Error('Canonical source level layout changed')
      const rgba = new Uint8Array(job.bytes)
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = y * width + x, byte = 255 - level[i], offset = i * 4
        rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = byte; rgba[offset + 3] = 255
      }
      if (signal?.aborted || generation !== this.generation) return 'cancelled'
      const result = uploadBrushTexture(this.gl, [rgba], this.gl.RGBA, this.gl.CLAMP_TO_EDGE, true, { width, height },storage)
      uploaded = result
      // Existing rectangular uploader intentionally defaults LINEAR minification;
      // canonical prepared source is sampled explicitly at NEAREST texel centres.
      const previous = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D) as WebGLTexture | null
      restoreSource=()=>this.gl.bindTexture(this.gl.TEXTURE_2D,previous)
      this.gl.bindTexture(this.gl.TEXTURE_2D,uploaded.texture);this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MIN_FILTER,this.gl.NEAREST)
      restoreSource();restoreSource=undefined
      if (signal?.aborted || generation !== this.generation) return 'cancelled'
      this.owned.add(job.key);this.cache.putOwned(job.key,uploaded!);uploaded=undefined
      return 'ready'
      })()
    }catch(error){failed=true;failure=error}
    finally {
      if(restoreSource)attempt(restoreSource)
      if(uploaded)attempt(()=>releaseUnpublishedBrushResource(uploaded!))
      attempt(()=>releaseStorageReservation(storage));attempt(releaseGpu);attempt(releaseCpu)
    }
    if(failed)throw failure
    return result
  }

  isReady(): boolean { return this.jobs.every(job => this.cache.resourceBytes(job.key) === job.bytes && !!this.cache.get(job.key)) }
  resources(): readonly TransformedMaskSource[] {
    if (!this.isReady()) throw new Error('Canonical source bank is not prepared')
    return this.jobs.map(job => ({ key: job.key, texture: this.cache.get(job.key)!, width: job.resource.width, height: job.resource.height }))
  }
  /** Cold trusted metadata snapshot for prepass binding, no pixels/uploads.
   * Includes finite per-level fields and one small crop record; these records
   * and their prepass copies are covered by the existing 512B/job metadata charge.
   * Old resources() texture API intentionally remains unchanged. */
  preparedResources(): readonly TransformedMaskPreparedSource[] {
    if (!this.isReady()) throw new Error('Canonical source bank is not prepared')
    return this.jobs.map(job => {
      const resource = job.resource, input = this.inputs.get(job.key)!;
      const index = sourcePngPyramid(resource.rect.width, resource.rect.height).levels.findIndex(level => level.scale === resource.scale);
      if (index < 0) throw new Error('Canonical source level metadata changed');
      return Object.freeze({ key: job.key, bytes: job.bytes, canonical: Object.freeze({
        asset: Object.freeze({ id: resource.id, size: input.assetSide, ...resource.rect }), index,
        baseScale: resource.scale, nativeWidth: resource.nativeWidth, nativeHeight: resource.nativeHeight,
      }) });
    });
  }
  lease(): () => void {
    if (!this.isReady()) throw new Error('Canonical source bank is not prepared')
    return this.cache.lease(this.jobs)
  }
  reset(lost = false): void {
    this.generation++
    let failed=false,primary:unknown
    for(const key of this.owned)try{this.cache.discard(key,lost)}catch(error){if(!failed){failed=true;primary=error}}
    this.owned.clear()
    try{this.releaseMetadata?.()}catch(error){if(!failed){failed=true;primary=error}}
    this.releaseMetadata=undefined
    if(failed)throw primary
  }
}
