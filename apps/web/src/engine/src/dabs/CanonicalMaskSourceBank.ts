import type { BrushTip, TipMaskId } from '@grafetto/shared'
import { nativeImageBank, nativeImagePixels, type NativeImageResource } from './NativeImageBank'
import { BrushTextureCache, uploadBrushTexture } from './BrushTextureCache'
import { BrushMipCache } from './BrushMipCache'
import type { TransformedMaskSource } from './TransformedMaskPrepass'

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
  private readonly inputs = new Map<string, CanonicalMaskSourceInput>()
  private readonly owned = new Set<string>()
  private readonly gl: WebGLRenderingContext
  private readonly cache: BrushTextureCache
  private readonly cpu: BrushMipCache
  private readonly companion: CanonicalMaskCompanionBudget
  private releaseMetadata?: () => void
  private generation = 0

  constructor(gl: WebGLRenderingContext, cache: BrushTextureCache, cpu: BrushMipCache,
    inputs: readonly CanonicalMaskSourceInput[], companion: CanonicalMaskCompanionBudget) {
    this.gl = gl; this.cache = cache; this.cpu = cpu
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
        if (!jobs.has(key)) { jobs.set(key, job); this.inputs.set(key, { ...input }) }
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

  /** No CPU image bytes retained here: only the existing bounded L8 mip cache. */
  prepareJob(index: number, signal?: AbortSignal): 'ready' | 'cancelled' {
    if (signal?.aborted) return 'cancelled'
    if (!integer(index) || index >= this.jobs.length) throw new RangeError('Invalid canonical source job')
    const job = this.jobs[index], existing = this.cache.get(job.key)
    if (existing && this.cache.resourceBytes(job.key) !== job.bytes) throw new Error('Conflicting canonical source cache entry')
    const extraMetadata = this.releaseMetadata ? 0 : this.metadataCpuBytes
    if (this.cpu.reservedBytes + extraMetadata + (existing ? 0 : job.transientCpuBytes + this.companion.cpuBytes) > this.cpu.budgetBytes)
      throw new RangeError('Canonical source job exceeds the shared CPU budget')
    if (!this.releaseMetadata) this.releaseMetadata = this.cpu.reserve(this.metadataCpuBytes)
    if (existing) return 'ready'
    // Reserve companion even if not yet allocated: bank preparation cannot steal
    // the future prepass peak. Once its own reservation exists, counting it twice
    // is deliberately conservative; callers prepare source bank BEFORE prepass.
    const releaseCpu = this.cpu.reserve(job.transientCpuBytes + this.companion.cpuBytes)
    const resources = this.jobs.map(({ key, bytes }) => ({ key, bytes }))
    this.cache.protect(resources.map(item => item.key))
    const releaseGpu = this.cache.lease(resources), generation = this.generation
    let uploaded: WebGLTexture | undefined
    try {
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
      const result = uploadBrushTexture(this.gl, [rgba], this.gl.RGBA, this.gl.CLAMP_TO_EDGE, true, { width, height })
      uploaded = result.texture
      // Existing rectangular uploader intentionally defaults LINEAR minification;
      // canonical prepared source is sampled explicitly at NEAREST texel centres.
      const previous = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D) as WebGLTexture | null
      try { this.gl.bindTexture(this.gl.TEXTURE_2D, uploaded); this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST) }
      finally { this.gl.bindTexture(this.gl.TEXTURE_2D, previous) }
      if (signal?.aborted || generation !== this.generation) return 'cancelled'
      this.cache.put(job.key, uploaded, job.bytes); this.owned.add(job.key); uploaded = undefined
      return 'ready'
    } finally {
      if (uploaded) this.gl.deleteTexture(uploaded)
      releaseGpu(); releaseCpu()
    }
  }

  isReady(): boolean { return this.jobs.every(job => this.cache.resourceBytes(job.key) === job.bytes && !!this.cache.get(job.key)) }
  resources(): readonly TransformedMaskSource[] {
    if (!this.isReady()) throw new Error('Canonical source bank is not prepared')
    return this.jobs.map(job => ({ key: job.key, texture: this.cache.get(job.key)!, width: job.resource.width, height: job.resource.height }))
  }
  lease(): () => void {
    if (!this.isReady()) throw new Error('Canonical source bank is not prepared')
    return this.cache.lease(this.jobs)
  }
  reset(lost = false): void {
    this.generation++
    for (const key of this.owned) this.cache.discard(key, lost)
    this.owned.clear(); this.releaseMetadata?.(); this.releaseMetadata = undefined
  }
}
