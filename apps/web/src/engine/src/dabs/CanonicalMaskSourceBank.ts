import { reserveContextStorage, releaseStorageReservation } from '../buffers/ContextStorageOwner'
import { sourcePngPyramid, type BrushTip, type TipMaskId, type CanonicalMaterialAsset, canonicalPrimaryTexturePin, type CanonicalPrimaryTexturePin } from '@grafetto/shared'
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
/** Internal warm selection only; original pyramid indices, never a source grant. */
export interface CanonicalMaskSourceLevelRequirement {
  readonly asset: CanonicalMaterialAsset
  readonly indexes: readonly number[]
}
export interface CanonicalNativeImageSourceJob {
  readonly kind: 'native-image'
  readonly key: string
  readonly resource: NativeImageResource
  readonly bytes: number
  readonly transientCpuBytes: number
}
export interface CanonicalPatternSourceInput {
  readonly kind:'raw-pattern-l8'
  readonly asset:CanonicalMaterialAsset
  readonly pin:CanonicalPrimaryTexturePin
  readonly readOriginalGray:()=>Uint8Array
}
export interface CanonicalPatternSourceJob {
  readonly kind:'raw-pattern-l8'
  readonly key:string
  readonly asset:CanonicalMaterialAsset
  readonly bytes:number
  readonly transientCpuBytes:number
}
export type CanonicalMaskSourceJob=CanonicalNativeImageSourceJob|CanonicalPatternSourceJob
const patternResourceBrand:unique symbol=Symbol('canonical-pattern-resource')
const patternViews=new WeakMap<object,(owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache})=>void>()
export function assertCanonicalPatternResourceCurrent(resource:CanonicalPatternResource,owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache}):void {
  const check=patternViews.get(resource)
  if(!check)throw new Error('Unknown canonical pattern view')
  check(owners)
}
export interface CanonicalPatternResource {
  readonly [patternResourceBrand]:true
  readonly kind:'raw-pattern-l8'
  readonly key:string
  readonly asset:CanonicalMaterialAsset
  readonly texture:WebGLTexture
  readonly width:number
  readonly height:number
  readonly sampling:'nearest-clamp-l8-v1'
}
const imageJob=(job:CanonicalMaskSourceJob):job is CanonicalNativeImageSourceJob=>job.kind==='native-image'
const jobAsset=(job:CanonicalMaskSourceJob,side:number):CanonicalMaterialAsset=>imageJob(job)?{id:job.resource.id,size:side,...job.resource.rect}:job.asset
const jobWidth=(job:CanonicalMaskSourceJob)=>imageJob(job)?job.resource.width:job.asset.size
const jobHeight=(job:CanonicalMaskSourceJob)=>imageJob(job)?job.resource.height:job.asset.size
function assertImageOnlyInputs(inputs:unknown):void {
  if(!Array.isArray(inputs)||inputs.length>256)return // Existing full planner reports malformed arrays/counts.
  for(let i=0;i<inputs.length;i++){
    const item=Object.getOwnPropertyDescriptor(inputs,String(i))
    if(!item||!Object.hasOwn(item,'value')||!item.value||typeof item.value!=='object')continue
    const kind=Object.getOwnPropertyDescriptor(item.value,'kind')
    if(kind&&Object.hasOwn(kind,'value')&&kind.value==='raw-pattern-l8')throw new TypeError('Raw pattern requires root residency')
  }
}
function capturePatternInput(value:unknown):CanonicalPatternSourceInput {
  const input=ownData(value,['kind','asset','pin','readOriginalGray']),asset=captureAsset(input.asset)
  if(input.kind!=='raw-pattern-l8'||typeof input.readOriginalGray!=='function')throw new TypeError('Invalid canonical pattern input')
  const pin=canonicalPrimaryTexturePin(input.pin,asset)
  return Object.freeze({kind:'raw-pattern-l8',asset,pin,readOriginalGray:input.readOriginalGray as ()=>Uint8Array})
}
const patternKey=(asset:CanonicalMaterialAsset)=>`canonical-pattern:raw-l8-nearest-clamp-v1:${assetKey(asset)}`
export interface CanonicalMaskCompanionBudget { readonly gpuBytes: number; readonly cpuBytes: number }
const integer = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min
const JOB_METADATA_BYTES = 512
// Pending preparation and its published reader share these bounded closures.
const ROOT_METADATA_BYTES = 4096
const noRelease=()=>{}

function ownData(value:unknown,fields:readonly string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Invalid canonical image resource data')
  const keys=Reflect.ownKeys(value)
  if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))throw new TypeError('Invalid canonical image resource data')
  const result:Record<string,unknown>=Object.create(null)
  for(const key of fields){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Invalid canonical image resource data');result[key]=d.value}
  return result
}
function captureAsset(value:unknown):CanonicalMaterialAsset {
  const {id,size,x,y,width,height}=ownData(value,['id','size','x','y','width','height'])
  if(typeof id!=='string'||!/^asset:[a-f0-9]{64}$/.test(id)
    ||typeof size!=='number'||!integer(size,1)||size>4096||typeof x!=='number'||!integer(x)||typeof y!=='number'||!integer(y)
    ||typeof width!=='number'||!integer(width,1)||typeof height!=='number'||!integer(height,1)
    ||width*height>1048576||x+width>size||y+height>size||[size,x,y,width,height].some(v=>Object.is(v,-0)))throw new TypeError('Invalid canonical image resource data')
  return Object.freeze({id,size,x,y,width,height})
}
function captureAssetInput(value:unknown):CanonicalMaskAssetSourceInput {
  const input=ownData(value,['asset','readOriginalCoverage']),asset=captureAsset(input.asset)
  if(typeof input.readOriginalCoverage!=='function')throw new TypeError('Invalid canonical image resource data')
  return Object.freeze({asset,readOriginalCoverage:input.readOriginalCoverage as ()=>Uint8Array})
}
const assetKey=(a:CanonicalMaterialAsset)=>JSON.stringify([a.id,a.size,a.x,a.y,a.width,a.height])
function captureIndexes(value:unknown,length:number):readonly number[] {
  if(!Array.isArray(value)||!value.length||value.length>length)throw new RangeError('Invalid canonical source level indexes')
  const indexes:number[]=[],seen=new Set<number>()
  for(let i=0;i<value.length;i++){
    const d=Object.getOwnPropertyDescriptor(value,String(i)),index=d&&Object.hasOwn(d,'value')?d.value:undefined
    if(typeof index!=='number'||!integer(index)||Object.is(index,-0)||index>=length||seen.has(index))throw new RangeError('Invalid canonical source level indexes')
    seen.add(index);indexes.push(index)
  }
  return Object.freeze(indexes.sort((a,b)=>a-b))
}
function captureRequirements(value:unknown):ReadonlyMap<string,ReadonlySet<number>>|undefined {
  if(value===undefined)return undefined
  if(!Array.isArray(value)||!value.length||value.length>256)throw new RangeError('Invalid canonical source level requirements')
  const result=new Map<string,ReadonlySet<number>>()
  let count=0
  for(let i=0;i<value.length;i++){
    const field=Object.getOwnPropertyDescriptor(value,String(i))
    if(!field||!Object.hasOwn(field,'value'))throw new TypeError('Invalid canonical source level requirements')
    const item=ownData(field.value,['asset','indexes']),asset=captureAsset(item.asset),key=assetKey(asset)
    if(result.has(key))throw new RangeError('Duplicate canonical source level requirement')
    const indexes=captureIndexes(item.indexes,sourcePngPyramid(asset.width,asset.height).levels.length)
    count+=indexes.length;if(count>4096)throw new RangeError('Canonical source level requirements exceed budget')
    result.set(key,new Set(indexes))
  }
  return result
}

/** Allocation-free scalar upper bound before immutable root metadata capture.
 * Positive native rounding is floor(x + .5), exactly the pyramid's binary scales.
 * Duplicate inputs are conservatively counted; no uniqueness set is built here. */
function rootPlanningBound(inputs:readonly (CanonicalMaskAssetSourceInput|CanonicalPatternSourceInput)[],requirements?:readonly CanonicalMaskSourceLevelRequirement[]) {
  const data=(value:unknown,key:string):unknown=>{
    if(!value||typeof value!=='object')throw new TypeError('Invalid root planning data')
    const field=Object.getOwnPropertyDescriptor(value,key)
    if(!field||!Object.hasOwn(field,'value'))throw new TypeError('Invalid root planning data')
    return field.value
  }
  const length=(value:unknown,maximum:number)=>{
    if(!Array.isArray(value))throw new TypeError('Invalid root planning array')
    const n=data(value,'length')
    if(typeof n!=='number'||!integer(n,1)||n>maximum)throw new RangeError('Invalid root planning count')
    return n
  }
  const inputCount=length(inputs,256)
  let levels=0,indexes=0
  for(let i=0;i<inputCount;i++){
    const asset=data(data(inputs,String(i)),'asset'),width=data(asset,'width'),height=data(asset,'height')
    if(typeof width!=='number'||typeof height!=='number'||!integer(width,1)||!integer(height,1)||width>4096||height>4096)throw new RangeError('Invalid root source dimensions')
    const item=data(inputs,String(i)),tag=Object.getOwnPropertyDescriptor(item as object,'kind')
    if(tag&&Object.hasOwn(tag,'value')&&tag.value==='raw-pattern-l8'){levels++;continue}
    for(let scale=8;scale>1;scale*=.5)if(width*scale<=512||height*scale<=512)levels++
    levels++
    for(let scale=.5;Math.floor(width*scale+.5)!==0&&Math.floor(height*scale+.5)!==0;scale*=.5)levels++
    if(levels>4096)throw new RangeError('Root planning exceeds existing job cap')
  }
  if(requirements!==undefined){
    const n=length(requirements,256)
    for(let i=0;i<n;i++){
      indexes+=length(data(data(requirements,String(i)),'indexes'),4096)
      if(indexes>4096)throw new RangeError('Root requirements exceed existing job cap')
    }
  }
  return {inputCount,levels,indexes}
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

type BankInput = CanonicalMaskSourceInput | CanonicalMaskAssetSourceInput | CanonicalPatternSourceInput
type BankReader = Readonly<Pick<CanonicalMaskSourceInput,'assetSide'|'readOriginalCoverage'>> & { rootReferences?:number; rootOwners?:Map<object,()=>void> }
interface BankPlan { readonly jobs: readonly CanonicalMaskSourceJob[]; readonly inputs: ReadonlyMap<string,BankReader> }
function planInputs(inputs:readonly BankInput[],requiredLevels?:readonly CanonicalMaskSourceLevelRequirement[]):BankPlan {
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>256)throw new RangeError('Invalid canonical bank plan')
  const required=captureRequirements(requiredLevels),used=new Set<string>()
  const plannedInputs=new Map<string,BankReader>()
    const jobs = new Map<string, CanonicalMaskSourceJob>()
    for (let i=0;i<inputs.length;i++) {
      const field=Object.getOwnPropertyDescriptor(inputs,String(i))
      if(!field||!Object.hasOwn(field,'value')||!field.value||typeof field.value!=='object')throw new TypeError('Invalid canonical source input')
      const input:BankInput=field.value
      const tag=Object.getOwnPropertyDescriptor(input,'kind')
      if(tag&&Object.hasOwn(tag,'value')&&tag.value==='raw-pattern-l8'){
        const captured=capturePatternInput(input),asset=captured.asset,key=patternKey(asset)
        const job:CanonicalPatternSourceJob=Object.freeze({kind:'raw-pattern-l8',key,asset,bytes:4*asset.size*asset.size,transientCpuBytes:asset.size*asset.size})
        if(!jobs.has(key)){jobs.set(key,job);plannedInputs.set(key,Object.freeze({assetSide:asset.size,readOriginalCoverage:captured.readOriginalGray}))}
        continue
      }
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
      const originalAsset={id:resources[0].id,size:assetSide,...resources[0].rect},selectionKey=assetKey(originalAsset),indexes=required?.get(selectionKey)
      if(required&&!indexes)throw new RangeError('Missing canonical source level requirement')
      if(required)used.add(selectionKey)
      for (const [index,originalResource] of resources.entries()) {
        if(indexes&&!indexes.has(index))continue
        const resource = Object.freeze({ ...originalResource, rect: Object.freeze({ ...originalResource.rect }), bounds: Object.freeze({ ...originalResource.bounds }) })
        const key = `canonical-mask:straight-gray-rgba8:${resource.key}`
        const job = Object.freeze({ kind:'native-image' as const, key, resource, bytes: resource.width * resource.height * 4, transientCpuBytes: transientBytes(resource) })
        const prior=jobs.get(key)
        if(prior&&plannedInputs.get(key)!.assetSide!==assetSide)throw new RangeError('Conflicting canonical source metadata')
        for(const [k,j] of jobs)if(imageJob(j)&&j.resource.id===resource.id&&plannedInputs.get(k)!.assetSide!==assetSide)throw new RangeError('Conflicting canonical source side')
        if (!prior) { jobs.set(key, job); plannedInputs.set(key,Object.freeze({assetSide,readOriginalCoverage})) }
      }
    }
  if(required&&used.size!==required.size)throw new RangeError('Unknown canonical source level requirement')
  return {jobs:Object.freeze([...jobs.values()]),inputs:plannedInputs}
}
function jobBudget(jobs:readonly CanonicalMaskSourceJob[]){
  return {gpuBytes:jobs.reduce((n,j)=>n+j.bytes,0),metadataCpuBytes:JOB_METADATA_BYTES*jobs.length,
    maximumTransientCpuBytes:Math.max(0,...jobs.map(j=>j.transientCpuBytes))}
}
/** Same finite metadata planner as the bank constructor; never calls readers or GL. */
export function canonicalMaskSourceBankBudget(inputs:readonly BankInput[],requiredLevels?:readonly CanonicalMaskSourceLevelRequirement[]){
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>256)throw new RangeError('Invalid canonical bank plan')
  const plan=planInputs(inputs,requiredLevels)
  if(!plan.jobs.length||plan.jobs.length>4096)throw new RangeError('Invalid canonical bank plan')
  return Object.freeze({...jobBudget(plan.jobs),maximumSourceCpuBytes:Math.max(...[...plan.inputs.values()].map(input=>input.assetSide*input.assetSide)),
    resources:Object.freeze(plan.jobs.map(({key,bytes})=>Object.freeze({key,bytes})))})
}

export interface CanonicalMaskSourceExtension {
  readonly status:'pending'|'committed'|'cancelled'
  publish():undefined
  finalizeCleanup():undefined
  readonly jobs: readonly CanonicalMaskSourceJob[]
  prepareJob(index:number):'ready'|'cancelled'
  assertCurrent():void
  assertPreparedPublication():void
  preparedResources():readonly TransformedMaskPreparedSource[]
  commit():undefined
  cancel(lost?:boolean):undefined
}

/** Narrow immutable subset reader. Residency is not source execution authority. */
export interface CanonicalMaskSourceReader {
  isReady():boolean
  resources():readonly TransformedMaskSource[]
  preparedResources():readonly TransformedMaskPreparedSource[]
  assertRequiredSourceBinding(asset:CanonicalMaterialAsset,indexes:readonly number[],owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache}):number
  assertCurrentOwners(generation:number):void
}
export interface CanonicalMaskSourceLease extends CanonicalMaskSourceReader {
  patternResource(pin:CanonicalPrimaryTexturePin,asset:CanonicalMaterialAsset,owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache}):CanonicalPatternResource
  /** Resource-only child ownership; no pixel read, readiness scan or GL work. */
  retain():CanonicalMaskSourceLease
  release(lost?:boolean):undefined
}
export interface CanonicalMaskSourceRootPreparation {
  readonly status:'pending'|'committed'|'cancelled'
  readonly jobs:readonly CanonicalMaskSourceJob[]
  prepareJob(index:number):'ready'|'cancelled'
  assertCurrent():void
  assertPreparedPublication():void
  preparedResources():readonly TransformedMaskPreparedSource[]
  publish():CanonicalMaskSourceLease
  finalizeCleanup():undefined
  cancel(lost?:boolean):undefined
}

/** Finite source bank only. No active painter/descriptor hooks or new allowance.
 * Every selected original level is planned before reading/cropping/resizing.
 * Omitted selection preserves full-pyramid planning for existing callers.
 * Caller schedules one prepareJob per existing BrushPreparation job/frame. */
export class CanonicalMaskSourceBank {
  private _jobs: readonly CanonicalMaskSourceJob[]
  get jobs():readonly CanonicalMaskSourceJob[]{return this._jobs}
  get gpuBytes():number{return jobBudget(this.jobs).gpuBytes}
  get maximumTransientCpuBytes():number{return jobBudget(this.jobs).maximumTransientCpuBytes}
  get metadataCpuBytes():number{return jobBudget(this.jobs).metadataCpuBytes}
  private inputs:Map<string,BankReader>
  private pending?:CanonicalMaskSourceExtension|CanonicalMaskSourceRootPreparation
  private readonly owned = new Set<string>()
  private readonly gl: WebGLRenderingContext
  private readonly cache: BrushTextureCache
  private readonly cpu: BrushMipCache
  private companion: CanonicalMaskCompanionBudget
  private releaseMetadata?: () => void
  private generation = 0
  private resetting = false
  private readonly mode:'full'|'root-residency'
  private readonly originalOwner=this
  private readonly ownerProof:Readonly<{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache}>

  constructor(gl: WebGLRenderingContext, cache: BrushTextureCache, cpu: BrushMipCache,
    inputs: readonly BankInput[], companion: CanonicalMaskCompanionBudget,requiredLevels?:readonly CanonicalMaskSourceLevelRequirement[],mode:'full'|'root-residency'='full') {
    this.gl = gl; this.cache = cache; this.cpu = cpu;this.mode=mode
    this.ownerProof=Object.freeze({gl,cache,cpu})
    if(mode==='root-residency'){
      if(!Array.isArray(inputs)||inputs.length||requiredLevels!==undefined||!companion||!integer(companion.gpuBytes)||!integer(companion.cpuBytes))throw new RangeError('Invalid root residency bank')
      this.companion=Object.freeze({...companion});this._jobs=Object.freeze([]);this.inputs=new Map();this.releaseMetadata=cpu.reserve(512);return
    }
    if(mode!=='full')throw new RangeError('Invalid canonical bank mode')
    if (!companion || !integer(companion.gpuBytes) || !integer(companion.cpuBytes)
      || !Array.isArray(inputs) || inputs.length < 1 || inputs.length > 256) throw new RangeError('Invalid canonical bank plan')
    this.companion = { ...companion }
    assertImageOnlyInputs(inputs)
    const plan=planInputs(inputs,requiredLevels)
    this._jobs=plan.jobs;this.inputs=new Map(plan.inputs)
    const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    if (!integer(maximum, 1) || !this.jobs.length || this.jobs.length > 4096 || !integer(this.gpuBytes)
      || this.gpuBytes + companion.gpuBytes > cache.budgetBytes
      || this.metadataCpuBytes + this.maximumTransientCpuBytes + companion.cpuBytes > cpu.budgetBytes
      || this.jobs.some(job => jobWidth(job) > maximum || jobHeight(job) > maximum
        || imageJob(job)&&(job.resource.nativeWidth > 4096 || job.resource.nativeHeight > 4096)
        || jobWidth(job) * jobHeight(job) > 4 * 1024 * 1024))
      throw new RangeError('Canonical source bank exceeds existing brush budgets')
  }

  /** One caller-owned original root, using the same pending slot and cache.
   * Root rows are reclaimed after their last membership. OPEN readers never
   * change when another root publishes or releases. No whole-library readiness. */
  prepareRoot(inputs:readonly (CanonicalMaskAssetSourceInput|CanonicalPatternSourceInput)[],peakCompanion:CanonicalMaskCompanionBudget,requiredLevels?:readonly CanonicalMaskSourceLevelRequirement[]):CanonicalMaskSourceRootPreparation {
    const generation=this.generation
    this.assertCurrentOwners(generation)
    if(this.mode!=='root-residency'||this.pending)throw new Error('Canonical root preparation unavailable')
    if(!Array.isArray(inputs)||!inputs.length||inputs.length>256)throw new RangeError('Invalid root source inputs')
    const activeJobs=this.jobs
    const bound=rootPlanningBound(inputs,requiredLevels)
    this.assertCurrentOwners(generation)
    if(this.pending||this.jobs!==activeJobs)throw new Error('Root planning owner changed')
    // Covers original planner levels, captured inputs/selection and active-union
    // copies, before any array/map capture. Actual duplicate counts overreserve.
    const planningBytes=2048+(bound.inputCount+4*bound.levels+bound.indexes+this.jobs.length)*JOB_METADATA_BYTES
    const releasePlan=this.cpu.reserve(planningBytes)
    let planned:Readonly<{plan:BankPlan;companion:CanonicalMaskCompanionBudget}>|undefined
    let releaseMetadata:()=>void=noRelease,planningFailed=false,planningFailure:unknown
    try{
      const c=ownData(peakCompanion,['gpuBytes','cpuBytes'])
      if(typeof c.gpuBytes!=='number'||!integer(c.gpuBytes)||typeof c.cpuBytes!=='number'||!integer(c.cpuBytes))throw new RangeError('Invalid root companion budget')
      const companion=Object.freeze({gpuBytes:c.gpuBytes,cpuBytes:c.cpuBytes})
      const captured:(CanonicalMaskAssetSourceInput|CanonicalPatternSourceInput)[]=[]
      if(inputs.length!==bound.inputCount)throw new Error('Root source capture changed')
      for(let i=0;i<bound.inputCount;i++){
        const field=Object.getOwnPropertyDescriptor(inputs,String(i))
        if(!field||!Object.hasOwn(field,'value'))throw new TypeError('Invalid root source capture')
        const tag=Object.getOwnPropertyDescriptor(field.value,'kind')
        captured.push(tag&&Object.hasOwn(tag,'value')&&tag.value==='raw-pattern-l8'?capturePatternInput(field.value):captureAssetInput(field.value))
      }
      const selected:CanonicalMaskSourceLevelRequirement[]=[]
      let indexCount=0
      if(requiredLevels!==undefined){
        if(!Array.isArray(requiredLevels)||!requiredLevels.length||requiredLevels.length>256)throw new RangeError('Invalid root selection')
        for(let i=0;i<requiredLevels.length;i++){
          const field=Object.getOwnPropertyDescriptor(requiredLevels,String(i))
          if(!field||!Object.hasOwn(field,'value'))throw new TypeError('Invalid root selection')
          const value=ownData(field.value,['asset','indexes']),asset=captureAsset(value.asset)
          if(!Array.isArray(value.indexes)||(indexCount+=value.indexes.length)>bound.indexes)throw new Error('Root selection capture changed')
          selected.push(Object.freeze({asset,indexes:captureIndexes(value.indexes,sourcePngPyramid(asset.width,asset.height).levels.length)}))
        }
      }
      const actual=rootPlanningBound(captured,requiredLevels===undefined?undefined:selected)
      if(actual.levels>bound.levels||actual.indexes>bound.indexes)throw new Error('Root source capture changed')
      const plan=planInputs(Object.freeze(captured),requiredLevels===undefined?undefined:Object.freeze(selected))
      const release=this.cpu.reserve(ROOT_METADATA_BYTES+(2*plan.jobs.length+this.jobs.length)*JOB_METADATA_BYTES)
      let active=true
      releaseMetadata=()=>{if(active){active=false;release()}}
      planned=Object.freeze({plan,companion})
    }catch(error){planningFailed=true;planningFailure=error}
    try{releasePlan()}catch(error){if(!planningFailed){planningFailed=true;planningFailure=error}}
    if(planningFailed||!planned){try{releaseMetadata()}catch{}throw planningFailure}
    const {plan,companion}=planned
    try{
    this.assertCurrentOwners(generation)
    if(this.pending||this.jobs!==activeJobs)throw new Error('Canonical root preparation changed')
    let jobs=plan.jobs
    const readers=new Map<string,BankReader>(),union=new Map(this.jobs.map(j=>[j.key,j]))
    if(!jobs.length||jobs.length>4096)throw new RangeError('Invalid root source jobs')
    const sides=new Map<string,number>()
    for(const old of this.jobs)sides.set(jobAsset(old,this.inputs.get(old.key)!.assetSide).id,this.inputs.get(old.key)!.assetSide)
    for(const job of jobs){
      const input=plan.inputs.get(job.key)!,old=union.get(job.key)
      if(old&&(old.bytes!==job.bytes||JSON.stringify(old)!==JSON.stringify(job)))throw new Error('Conflicting root source metadata')
      const priorSide=sides.get(jobAsset(job,input.assetSide).id)
      if(priorSide!==undefined&&priorSide!==input.assetSide)throw new Error('Conflicting root source side')
      sides.set(jobAsset(job,input.assetSide).id,input.assetSide)
      readers.set(job.key,this.inputs.get(job.key)??{...input,rootReferences:0,rootOwners:new Map()});union.set(job.key,old??job)
    }
    let allJobs=Object.freeze([...union.values()])
    const crops=new Set(allJobs.map(job=>{const side=readers.get(job.key)?.assetSide??this.inputs.get(job.key)!.assetSide;return assetKey(jobAsset(job,side))}))
    const maximum=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number
    if(!integer(maximum,1)||crops.size>256||allJobs.length>4096||allJobs.reduce((n,j)=>n+j.bytes,0)+companion.gpuBytes>this.cache.budgetBytes
      ||jobs.some(j=>jobWidth(j)>maximum||jobHeight(j)>maximum||imageJob(j)&&(j.resource.nativeWidth>4096||j.resource.nativeHeight>4096)||jobWidth(j)*jobHeight(j)>4*1024*1024))throw new RangeError('Root source union exceeds existing brush budgets')
    let releasePin:()=>void=noRelease,state:'pending'|'committed'|'cancelled'='pending',released=false,preparing=false
    const owner=Object.freeze({bank:this}),created=new Set<string>()
    let releasePublication:()=>void=noRelease
    let publication:Readonly<{priorJobs:readonly CanonicalMaskSourceJob[];jobs:readonly CanonicalMaskSourceJob[];inputs:Map<string,BankReader>;memberships:Map<object,()=>void>}>|undefined
    let lease:CanonicalMaskSourceLease
    const current=()=>{this.assertCurrentOwners(generation);if(released||state==='cancelled')throw new Error('Canonical root residency retired')}
    const ready=()=>{current();return jobs.every(j=>this.cache.resourceBytes(j.key)===j.bytes&&!!this.cache.get(j.key))}
    const binding=(asset:CanonicalMaterialAsset,indexes:readonly number[],owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache})=>{
      current();if(owners.gl!==this.gl||owners.cache!==this.cache||owners.cpu!==this.cpu||!ready())throw new Error('Canonical root source unavailable')
      const a=captureAsset(asset),levels=sourcePngPyramid(a.width,a.height).levels,selected=captureIndexes(indexes,levels.length),sources=this.preparedPlanResources(jobs,readers)
      for(const index of selected){const found=sources.filter(s=>s.canonical?.index===index&&assetKey(s.canonical.asset)===assetKey(a));if(found.length!==1)throw new Error('Canonical required root source missing')}
      current();return generation
    }
    const release=(lost=false):undefined=>{
      if(released)return undefined
      released=true;publication=undefined
      let failed=false,error:unknown
      const attempt=(fn:()=>void)=>{try{fn()}catch(e){if(!failed){failed=true;error=e}}}
      if(state==='committed'){
        for(const job of jobs){const row=readers.get(job.key)!;if(this.inputs.get(job.key)!==row)continue;row.rootOwners?.delete(owner);row.rootReferences!--;if(row.rootReferences===0){this.inputs.delete(job.key);this.owned.delete(job.key)}}
        this._jobs=Object.freeze(this.jobs.filter(j=>this.inputs.has(j.key)))
      }else{state='cancelled';if(this.pending===preparation)this.pending=undefined}
      const releaseStage=releasePublication;releasePublication=noRelease
      attempt(releaseStage);attempt(releasePin);attempt(releaseMetadata)
      // Cache owns unpinned released textures through its normal bounded LRU;
      // never discard a texture still held by an O2 source/capacity record.
      if(state==='cancelled')for(const key of created)if(!this.inputs.has(key))attempt(()=>{this.owned.delete(key);this.cache.discard(key,lost)})
      readers.clear();jobs=Object.freeze([]);allJobs=jobs
      if(failed)throw error
      return undefined
    }
    let handles=1
    const makeHandle=(key:object,releaseTokenCpu:()=>void):CanonicalMaskSourceLease=>{
      let retired=false
      const assertHandle=()=>{current();if(retired)throw new Error('Canonical source handle retired')}
      const releaseHandle=(lost=false):undefined=>{
        if(retired)return undefined
        retired=true
        readers.get(jobs[0]?.key)?.rootOwners?.delete(key)
        handles--
        let failed=false,error:unknown
        try{if(handles===0)release(lost)}catch(e){failed=true;error=e}
        try{releaseTokenCpu()}catch(e){if(!failed){failed=true;error=e}}
        if(failed)throw error
        return undefined
      }
      return Object.freeze({
        patternResource:(pin:CanonicalPrimaryTexturePin,asset:CanonicalMaterialAsset,owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache})=>{
          assertHandle()
          if(owners.gl!==this.gl||owners.cache!==this.cache||owners.cpu!==this.cpu)throw new Error('Canonical pattern owner changed')
          const a=captureAsset(asset);canonicalPrimaryTexturePin(pin,a)
          const job=jobs.find(j=>j.kind==='raw-pattern-l8'&&j.key===patternKey(a))
          if(!job||job.kind!=='raw-pattern-l8'||assetKey(job.asset)!==assetKey(a)||this.cache.resourceBytes(job.key)!==job.bytes)throw new Error('Canonical pattern binding unavailable')
          const texture=this.cache.get(job.key)
          if(!texture)throw new Error('Canonical pattern resource unavailable')
          assertHandle()
          const view:CanonicalPatternResource=Object.freeze({[patternResourceBrand]:true as const,kind:'raw-pattern-l8',key:job.key,asset:job.asset,texture,width:a.size,height:a.size,sampling:'nearest-clamp-l8-v1'})
          patternViews.set(view,expected=>{
            assertHandle()
            if(expected.gl!==this.gl||expected.cache!==this.cache||expected.cpu!==this.cpu||this.cache.resourceBytes(job.key)!==job.bytes||this.cache.get(job.key)!==texture)throw new Error('Canonical pattern view changed')
            assertHandle()
          })
          return view
        },
        isReady:()=>{assertHandle();return ready()},
        resources:()=>{assertHandle();if(!ready())throw new Error('Canonical root source unavailable');return jobs.filter(imageJob).map(j=>({key:j.key,texture:this.cache.get(j.key)!,width:j.resource.width,height:j.resource.height}))},
        preparedResources:()=>{assertHandle();if(!ready())throw new Error('Canonical root source unavailable');return this.preparedPlanResources(jobs,readers)},
        assertRequiredSourceBinding:(asset:CanonicalMaterialAsset,indexes:readonly number[],owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache})=>{assertHandle();return binding(asset,indexes,owners)},
        assertCurrentOwners:(expected:number)=>{assertHandle();if(expected!==generation)throw new Error('Canonical root generation changed')},
        retain:()=>{
          assertHandle()
          if(state!=='committed')throw new Error('Canonical root not published')
          const releaseCpu=this.cpu.reserve(2048)
          try{
            // reserve may reenter selection cleanup/reset. Reassert only the
            // original handle/lifetime; no cache/reader/GL callback is invoked.
            assertHandle()
            const childKey=Object.freeze({bank:this}),child=makeHandle(childKey,releaseCpu)
            readers.get(jobs[0].key)!.rootOwners!.set(childKey,()=>child.release())
            handles++
            return child
          }catch(error){try{releaseCpu()}catch{}throw error}
        },
        release:releaseHandle,
      })
    }
    lease=makeHandle(owner,noRelease)
    const assert=(receiver:unknown)=>{if(receiver!==preparation)throw new Error('Canonical root preparation receiver changed');current();if(state==='pending'&&this.pending!==preparation)throw new Error('Canonical root preparation replaced')}
    const preparation:CanonicalMaskSourceRootPreparation=Object.freeze({
      get status(){return state},
      get jobs(){return jobs},
      prepareJob(index:number){
        assert(this)
        if(state!=='pending'||!integer(index)||index>=jobs.length)throw new RangeError('Invalid root source job')
        if(preparing)throw new Error('Canonical root source job reentered')
        publication=undefined
        const releaseStage=releasePublication;releasePublication=noRelease;releaseStage()
        preparing=true
        try{return owner.bank.preparePlannedJob(jobs[index],readers.get(jobs[index].key)!,allJobs,companion,
          ()=>state==='pending'&&!released&&owner.bank.pending===preparation&&owner.bank.generation===generation,
          noRelease,key=>created.add(key))}finally{preparing=false}
      },
      assertCurrent(){assert(this)},
      assertPreparedPublication(){
        assert(this)
        if(preparing||!ready())throw new Error('Canonical root source not prepared')
        if(state==='committed')return
        publication=undefined
        const releaseOld=releasePublication;releasePublication=noRelease;releaseOld()
        const first=readers.get(jobs[0].key)!,count=first.rootOwners!.size
        const releaseStage=owner.bank.cpu.reserve(count*128)
        try{
          assert(this)
          if(!ready()||first.rootOwners!.size>count)throw new Error('Root membership capture changed')
          const priorJobs=owner.bank.jobs,stagedInputs=new Map(owner.bank.inputs),stagedJobs=new Map(priorJobs.map(job=>[job.key,job]))
          for(const job of jobs){
            stagedInputs.set(job.key,readers.get(job.key)!)
            if(!stagedJobs.has(job.key))stagedJobs.set(job.key,job)
          }
          const memberships=new Map(first.rootOwners)
          memberships.set(owner,()=>lease.release())
          publication=Object.freeze({priorJobs,jobs:Object.freeze([...stagedJobs.values()]),inputs:stagedInputs,memberships})
          releasePublication=releaseStage
        }catch(error){try{releaseStage()}catch{}throw error}
      },
      preparedResources(){
        assert(this)
        if(!ready())throw new Error('Canonical root source not prepared')
        return lease.preparedResources()
      },
      publish(){
        assert(this)
        if(state==='committed')return lease
        if(!publication||owner.bank.jobs!==publication.priorJobs)throw new Error('Validate current canonical root publication before publish')
        const first=readers.get(jobs[0].key)!,members=first.rootOwners!
        if(members.size!==publication.memberships.size-1)throw new Error('Root publication memberships changed')
        for(const [key,callback]of publication.memberships)if(key!==owner&&members.get(key)!==callback)throw new Error('Root publication memberships changed')
        // All maps and membership storage were charged/staged before this pure
        // publication. No reader, progress callback, cache scan or GL call here.
        for(const job of jobs){const row=readers.get(job.key)!;row.rootReferences=(row.rootReferences??0)+1}
        readers.get(jobs[0].key)!.rootOwners=publication.memberships
        owner.bank.inputs=publication.inputs;owner.bank._jobs=publication.jobs
        publication=undefined;allJobs=jobs;state='committed'
        if(owner.bank.pending===preparation)owner.bank.pending=undefined
        return lease
      },
      finalizeCleanup(){
        if(this!==preparation)throw new Error('Canonical root preparation receiver changed')
        if(state==='pending')throw new Error('Canonical root preparation not published')
        const releaseStage=releasePublication;releasePublication=noRelease;releaseStage()
        return undefined
      },
      cancel(lost=false){
        if(this!==preparation)throw new Error('Canonical root preparation receiver changed')
        if(state==='committed')return undefined
        return release(lost)
      },
    })
    try{
      releasePin=this.cache.leaseRequired(jobs)
      this.assertCurrentOwners(generation)
      if(this.pending)throw new Error('Canonical root preparation changed')
      this.pending=preparation
      return preparation
    }catch(error){try{release()}catch{}throw error}
    }catch(error){try{releaseMetadata()}catch{}throw error}
  }

  /** Add resources without replacing committed keys, readers or hot generation.
   * Call lazily from the creator's first preparation job, never before run(). */
  beginExtension(inputs:readonly BankInput[],peakCompanion:CanonicalMaskCompanionBudget,requiredLevels?:readonly CanonicalMaskSourceLevelRequirement[]):CanonicalMaskSourceExtension {
    assertImageOnlyInputs(inputs)
    const generation=this.generation
    this.assertCurrentOwners(generation)
    if(this.mode!=='full'||this.pending||!this.isReady())throw new Error('Canonical bank extension unavailable')
    const c=ownData(peakCompanion,['gpuBytes','cpuBytes'])
    if(typeof c.gpuBytes!=='number'||!integer(c.gpuBytes)||typeof c.cpuBytes!=='number'||!integer(c.cpuBytes))throw new RangeError('Invalid canonical companion budget')
    const companion=Object.freeze({gpuBytes:c.gpuBytes,cpuBytes:c.cpuBytes}),incoming=planInputs(inputs,requiredLevels)
    const union=new Map(this.jobs.map(j=>[j.key,j])),readers=new Map(this.inputs),added:CanonicalMaskSourceJob[]=[]
    for(const job of incoming.jobs){
      const input=incoming.inputs.get(job.key)!
      for(const existing of union.values())if(jobAsset(existing,readers.get(existing.key)!.assetSide).id===jobAsset(job,input.assetSide).id&&readers.get(existing.key)!.assetSide!==input.assetSide)
        throw new RangeError('Conflicting canonical source side')
      const prior=union.get(job.key)
      if(prior){
        // Both records came from the same closed native planner. Compare its
        // bounded resource data, not readers or arbitrary caller objects.
        if(prior.bytes!==job.bytes||JSON.stringify(prior)!==JSON.stringify(job))throw new RangeError('Conflicting canonical source metadata')
      }else{union.set(job.key,job);readers.set(job.key,input);added.push(job)}
    }
    const jobs=Object.freeze([...union.values()]),newJobs=Object.freeze(added)
    const inputCount=new Set(jobs.map(j=>assetKey(jobAsset(j,readers.get(j.key)!.assetSide)))).size
    const gpu=jobs.reduce((n,j)=>n+j.bytes,0),delta=JOB_METADATA_BYTES*newJobs.length
    const transient=newJobs.length?Math.max(...newJobs.map(j=>j.transientCpuBytes)):0
    const maximum=this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number
    if(!integer(maximum,1)||jobs.length>4096||inputCount>256||gpu+companion.gpuBytes>this.cache.budgetBytes
      ||this.cpu.reservedBytes+delta+transient+companion.cpuBytes>this.cpu.budgetBytes
      ||newJobs.some(j=>jobWidth(j)>maximum||jobHeight(j)>maximum||imageJob(j)&&(j.resource.nativeWidth>4096||j.resource.nativeHeight>4096)||jobWidth(j)*jobHeight(j)>4*1024*1024))
      throw new RangeError('Canonical source extension exceeds existing brush budgets')
    this.assertCurrentOwners(generation)
    if(this.pending)throw new Error('Canonical bank extension unavailable')
    let state:'pending'|'committed'|'cancelled'='pending',releaseDelta:()=>void=noRelease,releaseLease:()=>void=noRelease,combinedRelease:()=>void=noRelease,publicationChecked=false
    const previousRelease=this.releaseMetadata!
    const created=new Set<string>(),owner=Object.freeze({bank:this})
    const current=()=>state==='pending'&&owner.bank.pending===extension&&owner.bank.generation===generation&&!!owner.bank.releaseMetadata
    const assert=(receiver:unknown)=>{if(receiver!==extension||!current())throw new Error('Canonical bank extension changed')}
    const ready=()=>jobs.every(j=>owner.bank.cache.resourceBytes(j.key)===j.bytes&&!!owner.bank.cache.get(j.key))
    const extension:CanonicalMaskSourceExtension=Object.freeze({
      jobs:newJobs,
      get status(){return state},
      assertCurrent(){assert(this)},
      assertPreparedPublication(){assert(this);if(!ready())throw new Error('Canonical source extension is not prepared');publicationChecked=true},
      prepareJob(index:number){
        assert(this)
        if(!integer(index)||index>=newJobs.length)throw new RangeError('Invalid canonical source extension job')
        const job=newJobs[index];publicationChecked=false
        return owner.bank.preparePlannedJob(job,readers.get(job.key)!,jobs,companion,current,()=>{},key=>created.add(key))
      },
      preparedResources(){assert(this);extension.assertPreparedPublication();return owner.bank.preparedPlanResources(jobs,readers)},
      publish(){
        assert(this);if(!publicationChecked)throw new Error('Validate canonical bank publication before publish')
        // All plan construction/checks precede publication. No user callback or
        // GL query occurs between the last identity check and these assignments.
        owner.bank._jobs=jobs;owner.bank.inputs=readers;owner.bank.companion=companion
        owner.bank.releaseMetadata=combinedRelease
        // Addition preserves every old immutable key/binding. Only reset advances
        // the epoch captured by already admitted coordinator entries.
        releaseDelta=noRelease;state='committed'
        return undefined
      },
      finalizeCleanup(){
        if(this!==extension)throw new Error('Canonical bank extension receiver changed')
        if(state==='pending')throw new Error('Canonical bank extension is not published')
        if(owner.bank.pending===extension)owner.bank.pending=undefined
        const release=releaseLease;releaseLease=noRelease;release()
        return undefined
      },
      commit(){
        if(this!==extension)throw new Error('Canonical bank extension receiver changed')
        extension.assertPreparedPublication();extension.publish();extension.finalizeCleanup();return undefined
      },
      cancel(lost=false){
        if(this!==extension)throw new Error('Canonical bank extension receiver changed')
        if(state!=='pending')return undefined
        state='cancelled';if(owner.bank.pending===extension)owner.bank.pending=undefined
        let failed=false,primary:unknown
        const attempt=(f:()=>void)=>{try{f()}catch(e){if(!failed){failed=true;primary=e}}}
        for(const key of created){owner.bank.owned.delete(key);attempt(()=>owner.bank.cache.discard(key,lost))}
        created.clear();const metadata=releaseDelta,lease=releaseLease;releaseDelta=noRelease;releaseLease=noRelease
        attempt(metadata);attempt(lease);if(failed)throw primary
        return undefined
      },
    })
    try{
      releaseDelta=this.cpu.reserve(delta)
      const deltaRelease=releaseDelta
      combinedRelease=()=>{let failed=false,primary:unknown;try{previousRelease()}catch(e){failed=true;primary=e}try{deltaRelease()}catch(e){if(!failed){failed=true;primary=e}}if(failed)throw primary}
      releaseLease=this.cache.lease(jobs)
      this.assertCurrentOwners(generation)
      if(this.pending)throw new Error('Canonical bank extension unavailable')
      this.pending=extension
      return extension
    }catch(error){try{extension.cancel()}catch{/* Preserve admission failure. */}throw error}
  }

  /** Explicit subset query. Does not claim the theoretical full pyramid is ready. */
  assertRequiredSourceBinding(value:CanonicalMaterialAsset,indexes:readonly number[],owners:{gl:WebGLRenderingContext;cache:BrushTextureCache;cpu:BrushMipCache}):number {
    const generation=this.generation,asset=captureAsset(value),levels=sourcePngPyramid(asset.width,asset.height).levels,required=captureIndexes(indexes,levels.length)
    this.assertCurrentOwners(generation)
    if(owners.gl!==this.gl||owners.cache!==this.cache||owners.cpu!==this.cpu||!this.isReady())throw new Error('Canonical bank owner/source unavailable')
    const sources=this.preparedResources().filter(s=>s.canonical&&assetKey(s.canonical.asset)===assetKey(asset))
    for(const index of required){
      const matches=sources.filter(s=>s.canonical!.index===index),source=matches[0],m=source?.canonical,level=levels[index]
      if(matches.length!==1||!m||m.baseScale!==level.scale||m.nativeWidth!==level.width||m.nativeHeight!==level.height
        ||source.bytes!==level.storedWidth*level.storedHeight*4)throw new Error('Canonical required source binding missing or changed')
    }
    this.assertCurrentOwners(generation)
    return generation
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
      ||generation!==this.generation||this.resetting||!this.releaseMetadata)throw new Error('Canonical bank owner/generation changed')
  }

  /** No CPU image bytes retained here: only the existing bounded L8 mip cache. */
  prepareJob(index: number, signal?: AbortSignal): 'ready' | 'cancelled' {
    if(this.mode!=='full')throw new Error('Root residency bank requires a root preparation')
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
      if(!imageJob(job)){
        uploaded=uploadBrushTexture(this.gl,[original],this.gl.LUMINANCE,this.gl.CLAMP_TO_EDGE,true,undefined,storage)
        if(!current()||generation!==this.generation)return 'cancelled'
        this.owned.add(job.key);onOwned?.(job.key);this.cache.putOwned(job.key,uploaded);uploaded=undefined
        return 'ready'
      }
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
    return this.jobs.filter(imageJob).map(job => ({ key: job.key, texture: this.cache.get(job.key)!, width: job.resource.width, height: job.resource.height }))
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
    return jobs.filter(imageJob).map(job => {
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
    if(this.resetting)return
    this.resetting=true
    try{
    this.generation++
    const owned=this.mode==='root-residency'?[...this.owned]:this.owned
    let failed=false,primary:unknown
    const pending=this.pending;this.pending=undefined
    const roots=[...this.inputs.values()].flatMap(row=>[...row.rootOwners?.values()??[]])
    for(const release of roots)try{release()}catch(error){if(!failed){failed=true;primary=error}}
    if(this.mode==='root-residency'){this.inputs.clear();this._jobs=Object.freeze([])}
    try{if(pending?.status==='committed')pending.finalizeCleanup();else pending?.cancel(lost)}catch(error){failed=true;primary=error}
    for(const key of owned)try{this.cache.discard(key,lost)}catch(error){if(!failed){failed=true;primary=error}}
    this.owned.clear()
    try{this.releaseMetadata?.()}catch(error){if(!failed){failed=true;primary=error}}
    this.releaseMetadata=undefined
    if(failed)throw primary
    }finally{this.resetting=false}
  }
}
