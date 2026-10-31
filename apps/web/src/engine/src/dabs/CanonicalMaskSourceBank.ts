import { reserveContextStorage, releaseStorageReservation } from '../buffers/ContextStorageOwner'
import { sourcePngPyramid, type BrushTip, type TipMaskId, type CanonicalMaterialAsset } from '@grafetto/shared'
import { nativeImageBank, nativeImageBankFromRect, nativeImagePixels, type NativeImageResource } from './NativeImageBank'
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
/** Resource data from an already normalized original image context. The
 * engine provider, not this bank, owns source provenance and read authority. */
export interface CanonicalMaskAssetSourceInput {
  readonly asset: CanonicalMaterialAsset
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

function ownData(value:unknown,fields:readonly string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Invalid canonical image resource data')
  const keys=Reflect.ownKeys(value)
  if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))throw new TypeError('Invalid canonical image resource data')
  const result:Record<string,unknown>=Object.create(null)
  for(const key of fields){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Invalid canonical image resource data');result[key]=d.value}
  return result
}
function captureAssetInput(value:unknown):CanonicalMaskAssetSourceInput {
  const input=ownData(value,['asset','readOriginalCoverage']),a=ownData(input.asset,['id','size','x','y','width','height'])
  const {id,size,x,y,width,height}=a
  if(typeof input.readOriginalCoverage!=='function'||typeof id!=='string'||!/^asset:[a-f0-9]{64}$/.test(id)
    ||typeof size!=='number'||!integer(size,1)||size>4096||typeof x!=='number'||!integer(x)||typeof y!=='number'||!integer(y)
    ||typeof width!=='number'||!integer(width,1)||typeof height!=='number'||!integer(height,1)
    ||width*height>1048576||x+width>size||y+height>size||[size,x,y,width,height].some(v=>Object.is(v,-0)))throw new TypeError('Invalid canonical image resource data')
  return Object.freeze({asset:Object.freeze({id,size,x,y,width,height}),readOriginalCoverage:input.readOriginalCoverage as ()=>Uint8Array})
}

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

type BankInput = CanonicalMaskSourceInput | CanonicalMaskAssetSourceInput
type BankReader = Readonly<Pick<CanonicalMaskSourceInput,'assetSide'|'readOriginalCoverage'>>
interface BankPlan { readonly jobs: readonly CanonicalMaskSourceJob[]; readonly inputs: ReadonlyMap<string,BankReader> }
function planInputs(inputs:readonly BankInput[]):BankPlan {
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>256)throw new RangeError('Invalid canonical bank plan')
  const plannedInputs=new Map<string,BankReader>()
    const jobs = new Map<string, CanonicalMaskSourceJob>()
    for (let i=0;i<inputs.length;i++) {
      const field=Object.getOwnPropertyDescriptor(inputs,String(i))
      if(!field||!Object.hasOwn(field,'value')||!field.value||typeof field.value!=='object')throw new TypeError('Invalid canonical source input')
      const input:CanonicalMaskSourceInput|CanonicalMaskAssetSourceInput=field.value
      let resources:readonly NativeImageResource[],assetSide:number,readOriginalCoverage:()=>Uint8Array
      if('asset' in input){
        const captured=captureAssetInput(input),asset=captured.asset
        assetSide=asset.size;readOriginalCoverage=captured.readOriginalCoverage
        resources=nativeImageBankFromRect(asset.id as TipMaskId,asset)
      }else{
        const policy = input.tip?.imageSampling, rect = policy?.sourceRect
        if (typeof input.id !== 'string' || !input.id || input.tip.kind !== 'bitmap' || input.tip.material || !policy
          || policy.kind !== 'integer-pyramid' || policy.signal !== 'inverse-gray'
          || !rect || !integer(input.assetSide, 1) || input.assetSide > 4096
          || !integer(rect.x) || !integer(rect.y) || !integer(rect.width, 1) || !integer(rect.height, 1)
          || rect.x + rect.width > input.assetSide || rect.y + rect.height > input.assetSide
          || typeof input.readOriginalCoverage !== 'function') throw new RangeError('Canonical source requires opaque grayscale provenance')
        assetSide=input.assetSide;readOriginalCoverage=input.readOriginalCoverage
        resources=nativeImageBank(input.id,input.tip)
      }
      for (const originalResource of resources) {
        const resource = Object.freeze({ ...originalResource, rect: Object.freeze({ ...originalResource.rect }), bounds: Object.freeze({ ...originalResource.bounds }) })
        const key = `canonical-mask:straight-gray-rgba8:${resource.key}`
        const job = Object.freeze({ key, resource, bytes: resource.width * resource.height * 4, transientCpuBytes: transientBytes(resource) })
        const prior=jobs.get(key)
        if(prior&&plannedInputs.get(key)!.assetSide!==assetSide)throw new RangeError('Conflicting canonical source metadata')
        for(const [k,j] of jobs)if(j.resource.id===resource.id&&plannedInputs.get(k)!.assetSide!==assetSide)throw new RangeError('Conflicting canonical source side')
        if (!prior) { jobs.set(key, job); plannedInputs.set(key,Object.freeze({assetSide,readOriginalCoverage})) }
      }
    }
  return {jobs:Object.freeze([...jobs.values()]),inputs:plannedInputs}
}
export interface CanonicalMaskSourceExtension {
  readonly jobs: readonly CanonicalMaskSourceJob[]
  prepareJob(index:number):'ready'|'cancelled'
  assertCurrent():void
  preparedResources():readonly TransformedMaskPreparedSource[]
  commit():undefined
  cancel(lost?:boolean):undefined
}

/** Finite source bank only. No active painter/descriptor hooks or new allowance.
 * Every reachable level is planned before reading/cropping/resizing any image.
 * Caller schedules one prepareJob per existing BrushPreparation job/frame. */
export class CanonicalMaskSourceBank {
  private _jobs: readonly CanonicalMaskSourceJob[]
  get jobs():readonly CanonicalMaskSourceJob[]{return this._jobs}
  get gpuBytes():number{return this.jobs.reduce((n,j)=>n+j.bytes,0)}
  get maximumTransientCpuBytes():number{return Math.max(...this.jobs.map(j=>j.transientCpuBytes))}
  get metadataCpuBytes():number{return JOB_METADATA_BYTES*this.jobs.length}
  private inputs:Map<string,BankReader>
  private pending?:CanonicalMaskSourceExtension
  private readonly owned = new Set<string>()
  private readonly gl: WebGLRenderingContext
  private readonly cache: BrushTextureCache
  private readonly cpu: BrushMipCache
  private companion: CanonicalMaskCompanionBudget
  private releaseMetadata?: () => void
  private generation = 0
  private readonly originalOwner=this
  private readonly ownerProof:Readonly<{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache}>

  constructor(gl: WebGLRenderingContext, cache: BrushTextureCache, cpu: BrushMipCache,
    inputs: readonly (CanonicalMaskSourceInput|CanonicalMaskAssetSourceInput)[], companion: CanonicalMaskCompanionBudget) {
    this.gl = gl; this.cache = cache; this.cpu = cpu
    this.ownerProof=Object.freeze({gl,cache,cpu})
    if (!companion || !integer(companion.gpuBytes) || !integer(companion.cpuBytes)
      || !Array.isArray(inputs) || inputs.length < 1 || inputs.length > 256) throw new RangeError('Invalid canonical bank plan')
    this.companion = { ...companion }
    const plan=planInputs(inputs)
    this._jobs=plan.jobs;this.inputs=new Map(plan.inputs)
    const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    if (!integer(maximum, 1) || !this.jobs.length || this.jobs.length > 4096 || !integer(this.gpuBytes)
      || this.gpuBytes + companion.gpuBytes > cache.budgetBytes
      || this.metadataCpuBytes + this.maximumTransientCpuBytes + companion.cpuBytes > cpu.budgetBytes
      || this.jobs.some(job => job.resource.width > maximum || job.resource.height > maximum
        || job.resource.nativeWidth > 4096 || job.resource.nativeHeight > 4096
        || job.resource.width * job.resource.height > 4 * 1024 * 1024))
      throw new RangeError('Canonical source bank exceeds existing brush budgets')
  }

  /** Add resources without replacing committed keys, readers or hot generation.
   * Call lazily from the creator's first preparation job, never before run(). */
  beginExtension(inputs:readonly BankInput[],peakCompanion:CanonicalMaskCompanionBudget):CanonicalMaskSourceExtension {
    const generation=this.generation
    this.assertCurrentOwners(generation)
    if(this.pending||!this.isReady())throw new Error('Canonical bank extension unavailable')
    const c=ownData(peakCompanion,['gpuBytes','cpuBytes'])
    if(typeof c.gpuBytes!=='number'||!integer(c.gpuBytes)||typeof c.cpuBytes!=='number'||!integer(c.cpuBytes))throw new RangeError('Invalid canonical companion budget')
    const companion=Object.freeze({gpuBytes:c.gpuBytes,cpuBytes:c.cpuBytes}),incoming=planInputs(inputs)
    const union=new Map(this.jobs.map(j=>[j.key,j])),readers=new Map(this.inputs),added:CanonicalMaskSourceJob[]=[]
    for(const job of incoming.jobs){
      const input=incoming.inputs.get(job.key)!
      for(const existing of union.values())if(existing.resource.id===job.resource.id&&readers.get(existing.key)!.assetSide!==input.assetSide)
        throw new RangeError('Conflicting canonical source side')
      const prior=union.get(job.key)
      if(prior){
        // Both records came from the same closed native planner. Compare its
        // bounded resource data, not readers or arbitrary caller objects.
        if(prior.bytes!==job.bytes||JSON.stringify(prior.resource)!==JSON.stringify(job.resource))throw new RangeError('Conflicting canonical source metadata')
      }else{union.set(job.key,job);readers.set(job.key,input);added.push(job)}
    }
    const jobs=Object.freeze([...union.values()]),newJobs=Object.freeze(added)
    const inputCount=new Set(jobs.map(j=>JSON.stringify([j.resource.id,readers.get(j.key)!.assetSide,j.resource.rect]))).size
    const gpu=jobs.reduce((n,j)=>n+j.bytes,0),delta=JOB_METADATA_BYTES*newJobs.length
    const transient=newJobs.length?Math.max(...newJobs.map(j=>j.transientCpuBytes)):0
    const maximum=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number
    if(!integer(maximum,1)||jobs.length>4096||inputCount>256||gpu+companion.gpuBytes>this.cache.budgetBytes
      ||this.cpu.reservedBytes+delta+transient+companion.cpuBytes>this.cpu.budgetBytes
      ||newJobs.some(j=>j.resource.width>maximum||j.resource.height>maximum||j.resource.nativeWidth>4096||j.resource.nativeHeight>4096||j.resource.width*j.resource.height>4*1024*1024))
      throw new RangeError('Canonical source extension exceeds existing brush budgets')
    this.assertCurrentOwners(generation)
    if(this.pending)throw new Error('Canonical bank extension unavailable')
    let state:'pending'|'committed'|'cancelled'='pending',releaseDelta:()=>void=()=>{},releaseLease:()=>void=()=>{}
    const created=new Set<string>(),owner=Object.freeze({bank:this})
    const current=()=>state==='pending'&&owner.bank.pending===extension&&owner.bank.generation===generation&&!!owner.bank.releaseMetadata
    const assert=(receiver:unknown)=>{if(receiver!==extension||!current())throw new Error('Canonical bank extension changed')}
    const ready=()=>jobs.every(j=>owner.bank.cache.resourceBytes(j.key)===j.bytes&&!!owner.bank.cache.get(j.key))
    const extension:CanonicalMaskSourceExtension=Object.freeze({
      jobs:newJobs,
      assertCurrent(){assert(this)},
      prepareJob(index:number){
        assert(this)
        if(!integer(index)||index>=newJobs.length)throw new RangeError('Invalid canonical source extension job')
        const job=newJobs[index]
        return owner.bank.preparePlannedJob(job,readers.get(job.key)!,jobs,companion,current,()=>{},key=>created.add(key))
      },
      preparedResources(){assert(this);if(!ready())throw new Error('Canonical source extension is not prepared');return owner.bank.preparedPlanResources(jobs,readers)},
      commit(){
        assert(this);if(!ready())throw new Error('Canonical source extension is not prepared')
        const previousRelease=owner.bank.releaseMetadata!,deltaRelease=releaseDelta
        const combinedRelease=()=>{let failed=false,primary:unknown;try{previousRelease()}catch(e){failed=true;primary=e}try{deltaRelease()}catch(e){if(!failed){failed=true;primary=e}}if(failed)throw primary}
        // All plan construction/checks precede publication. No user callback or
        // GL query occurs between the last identity check and these assignments.
        owner.bank._jobs=jobs;owner.bank.inputs=readers;owner.bank.companion=companion
        owner.bank.releaseMetadata=combinedRelease
        releaseDelta=()=>{};state='committed';owner.bank.pending=undefined;if(newJobs.length)owner.bank.generation++
        const release=releaseLease;releaseLease=()=>{};release()
        return undefined
      },
      cancel(lost=false){
        if(this!==extension)throw new Error('Canonical bank extension receiver changed')
        if(state!=='pending')return undefined
        state='cancelled';if(owner.bank.pending===extension)owner.bank.pending=undefined
        let failed=false,primary:unknown
        const attempt=(f:()=>void)=>{try{f()}catch(e){if(!failed){failed=true;primary=e}}}
        for(const key of created){owner.bank.owned.delete(key);attempt(()=>owner.bank.cache.discard(key,lost))}
        created.clear();const metadata=releaseDelta,lease=releaseLease;releaseDelta=()=>{};releaseLease=()=>{}
        attempt(metadata);attempt(lease);if(failed)throw primary
        return undefined
      },
    })
    try{
      releaseDelta=this.cpu.reserve(delta)
      releaseLease=this.cache.lease(jobs)
      this.assertCurrentOwners(generation)
      if(this.pending)throw new Error('Canonical bank extension unavailable')
      this.pending=extension
      return extension
    }catch(error){try{extension.cancel()}catch{/* Preserve admission failure. */}throw error}
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
    return this.preparePlannedJob(this.jobs[index],this.inputs.get(this.jobs[index].key)!,this.jobs,this.companion,
      ()=>!signal?.aborted,()=>{if(!this.releaseMetadata)this.releaseMetadata=this.cpu.reserve(this.metadataCpuBytes)})
  }
  private preparePlannedJob(job:CanonicalMaskSourceJob,input:BankReader,jobs:readonly CanonicalMaskSourceJob[],
    companion:CanonicalMaskCompanionBudget,current:()=>boolean,ensureMetadata:()=>void,onOwned?:(key:string)=>void):'ready'|'cancelled' {
    if(!current())return 'cancelled'
    const existing = this.cache.get(job.key)
    if (existing && this.cache.resourceBytes(job.key) !== job.bytes) throw new Error('Conflicting canonical source cache entry')
    const extraMetadata = this.releaseMetadata ? 0 : this.metadataCpuBytes
    if (this.cpu.reservedBytes + extraMetadata + (existing ? 0 : job.transientCpuBytes + companion.cpuBytes) > this.cpu.budgetBytes)
      throw new RangeError('Canonical source job exceeds the shared CPU budget')
    if(existing){ensureMetadata();return 'ready'}
    const storage=reserveContextStorage(this.gl,job.bytes,'brush-texture-rgba-equivalent')
    let releaseCpu=()=>{},releaseGpu=()=>{},restoreSource:(()=>void)|undefined,uploaded:OwnedBrushResource|undefined
    let failed=false,failure:unknown,result:'ready'|'cancelled'='cancelled'
    const attempt=(cleanup:()=>void)=>{try{cleanup()}catch(error){if(!failed){failed=true;failure=error}}}
    try {
      ensureMetadata()
      releaseCpu=this.cpu.reserve(job.transientCpuBytes+companion.cpuBytes)
      const resources=jobs.map(({key,bytes})=>({key,bytes}))
      this.cache.protect(resources.map(item=>item.key));releaseGpu=this.cache.lease(resources)
      const generation=this.generation
      result=(()=>{
      const original = input.readOriginalCoverage()
      if (!(original instanceof Uint8Array) || original.length !== input.assetSide * input.assetSide)
        throw new RangeError('Canonical source asset layout changed')
      if (!current() || generation !== this.generation) return 'cancelled'
      const level = this.cpu.get(job.resource.key, () => [nativeImagePixels(job.resource, original)])[0]
      const { width, height } = job.resource
      if (level.length !== width * height) throw new Error('Canonical source level layout changed')
      const rgba = new Uint8Array(job.bytes)
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = y * width + x, byte = 255 - level[i], offset = i * 4
        rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = byte; rgba[offset + 3] = 255
      }
      if (!current() || generation !== this.generation) return 'cancelled'
      const result = uploadBrushTexture(this.gl, [rgba], this.gl.RGBA, this.gl.CLAMP_TO_EDGE, true, { width, height },storage)
      uploaded = result
      // Existing rectangular uploader intentionally defaults LINEAR minification;
      // canonical prepared source is sampled explicitly at NEAREST texel centres.
      const previous = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D) as WebGLTexture | null
      restoreSource=()=>this.gl.bindTexture(this.gl.TEXTURE_2D,previous)
      this.gl.bindTexture(this.gl.TEXTURE_2D,uploaded.texture);this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MIN_FILTER,this.gl.NEAREST)
      restoreSource();restoreSource=undefined
      if (!current() || generation !== this.generation) return 'cancelled'
      this.owned.add(job.key);onOwned?.(job.key);this.cache.putOwned(job.key,uploaded!);uploaded=undefined
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
    return this.preparedPlanResources(this.jobs,this.inputs)
  }
  private preparedPlanResources(jobs:readonly CanonicalMaskSourceJob[],inputs:ReadonlyMap<string,BankReader>):readonly TransformedMaskPreparedSource[]{
    return jobs.map(job => {
      const resource = job.resource, input = inputs.get(job.key)!;
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
    const pending=this.pending;this.pending=undefined
    try{pending?.cancel(lost)}catch(error){failed=true;primary=error}
    for(const key of this.owned)try{this.cache.discard(key,lost)}catch(error){if(!failed){failed=true;primary=error}}
    this.owned.clear()
    try{this.releaseMetadata?.()}catch(error){if(!failed){failed=true;primary=error}}
    this.releaseMetadata=undefined
    if(failed)throw primary
  }
}
