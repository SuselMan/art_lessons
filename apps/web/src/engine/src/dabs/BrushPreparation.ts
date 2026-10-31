import { radialCurveTextureSide } from '../raster/radialCurve'
import { proceduralProfileUniforms } from '../raster/brushProcedural'
import { nativeImageBank, type NativeImageResource } from './NativeImageBank'
import { materialPackingPlan, materialGroupBytes, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { importedAssetPixels } from '../presets/importedBrushes'
import type { BrushDescriptor, BrushTip, BrushTextureId, TipMaskId } from '@grafetto/shared'

export interface BrushPreparationResource { painter: 'stamp' | 'wet'; id: TipMaskId | BrushTextureId; grain: boolean; gray?: string; discrete?: true; materialGroup?: MaterialTextureGroup; materialChannels?: 'ra' | 'rg' | 'ba'; nativeImage?: NativeImageResource; lookup32?: true }
export interface BrushPreparationOptions { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }
export interface BrushPreparationResult { status: 'ready' | 'skipped' | 'cancelled' }
export const brushTextureResourceKey = (resource: Pick<BrushPreparationResource,'id'|'grain'|'discrete'|'gray'|'materialGroup'|'nativeImage'|'lookup32'>): string => (resource.lookup32 ? `t:lookup32:${resource.id}` : undefined) ?? resource.nativeImage?.key ?? resource.materialGroup?.key ?? (resource.gray ? `t:lightness:${resource.id}:${resource.gray}` : `${resource.grain ? resource.discrete ? 'g:grid' : 'g' : 't'}:${resource.id}`)
export const BRUSH_PREPARATION_BYTES = 16 * 1024 * 1024

export function brushTipSamplerId(tip?: BrushTip): TipMaskId | undefined {
  return tip?.profile?.kind === 'radialCurve' ? tip.profile.lookup : tip?.mask
}
export function brushTipProfileUniforms(tip?: BrushTip): [number,number,number,number] {
  const profile=tip?.profile
  return proceduralProfileUniforms(profile, profile?.kind === 'radialCurve' ? radialCurveTextureSide(importedAssetPixels(profile.lookup), profile.resolution) : undefined)
}

const materialPlans = new WeakMap<BrushTip, ReturnType<typeof materialPackingPlan>>()
/** One physical resource resolver for preparation, pinning and render lookup. */
export function brushTipResource(id: TipMaskId, gray?: string, tip?: BrushTip): Omit<BrushPreparationResource,'painter'> {
  if (tip?.profile?.kind === 'radialCurve') {
    radialCurveTextureSide(importedAssetPixels(tip.profile.lookup),tip.profile.resolution)
    return {id:tip.profile.lookup,grain:false,lookup32:true}
  }
  if (!gray || !tip?.material || !tip.animation) return {id,grain:false,...(gray ? {gray} : {})}
  let plan=materialPlans.get(tip)
  if(!plan){
    const frames=tip.animation.frames.map((alpha,index)=>({alpha,gray:tip.material!.grayFrames?.[index] ?? tip.material!.gray}))
    plan=materialPackingPlan(frames,Math.sqrt(importedAssetPixels(frames[0].alpha).length))
    materialPlans.set(tip,plan)
  }
  const index=tip.animation.frames.findIndex((alpha,index)=>alpha===id && (tip.material!.grayFrames?.[index] ?? tip.material!.gray)===gray)
  if(index<0)throw Error('Material frame is absent from its tip plan')
  const view=plan.frames[index]
  return {id,gray,grain:false,materialGroup:view.group,materialChannels:view.channels}
}

/** Matches sampler routes, rather than uploading both formats for every tip. */
export function brushPreparationPlan(brush: BrushDescriptor): {
  resources: BrushPreparationResource[]
  capabilities: ('stamp' | 'wet' | 'stampImage' | 'wetImage' | 'stampCircleBand' | 'stampCurve' | 'wetCurve')[]
} {
  const capabilities = new Set<'stamp' | 'wet' | 'stampImage' | 'wetImage' | 'stampCircleBand' | 'stampCurve' | 'wetCurve'>()
  const resources = new Map<string, BrushPreparationResource>()
  const add = (painter: 'stamp' | 'wet', id: TipMaskId | BrushTextureId | undefined, grain = false, discrete = false, gray?: string, tip?: BrushTip) => {
    if (id) {
      if (!grain && tip?.imageSampling) {
        for (const nativeImage of nativeImageBank(id as TipMaskId, tip)) {
          const resource: BrushPreparationResource = { painter, id, grain: false, nativeImage }
          resources.set(`${painter}:${brushTextureResourceKey(resource)}`, resource)
        }
        return
      }
      const resource:BrushPreparationResource={painter,...(grain ? {id,grain,...(discrete ? {discrete:true as const} : {})} : brushTipResource(id as TipMaskId,gray,tip))}
      resources.set(`${painter}:${brushTextureResourceKey(resource)}`,resource)
    }
  }
  const visit = (b: BrushDescriptor, painter: 'stamp' | 'wet', covered = false) => {
    if (b.tip.profile?.kind === 'circleBand') {
      if (painter !== 'stamp' || b.behavior?.rendering?.accumulation !== 'maxAlpha') throw Error('Circle band requires stamp max-alpha accumulation')
      capabilities.add('stampCircleBand')
    }
    if(b.tip.profile?.kind==='gaussian' && painter==='wet') throw Error('Procedural tip profile requires the stamp renderer')
    if(b.tip.material && painter==='wet') throw Error('Lightness tip material requires the stamp renderer')
    const inline = b.behavior?.dual?.sampling !== 'independent' ? b.behavior?.dual?.brush : undefined
    if (!covered) {
      const curve = b.tip.profile?.kind === 'radialCurve' || inline?.tip.profile?.kind === 'radialCurve'
      if (curve) capabilities.add(painter === 'stamp' ? 'stampCurve' : 'wetCurve')
      else {
        if (b.tip.imageSampling || inline?.tip.imageSampling) capabilities.add(painter === 'stamp' ? 'stampImage' : 'wetImage')
        if (painter === 'stamp'
          ? b.tip.kind === 'procedural' && b.tip.profile?.kind !== 'circleBand' || inline?.tip.kind === 'procedural'
          : b.tip.profile?.kind === 'standard' || inline?.tip.profile?.kind === 'standard') capabilities.add(painter)
      }
    }
    const frames=b.tip.animation?.frames ?? (brushTipSamplerId(b.tip) ? [brushTipSamplerId(b.tip)!] : [])
    frames.forEach((id,index)=>add(painter,id,false,false,b.tip.material?.grayFrames?.[index] ?? b.tip.material?.gray,b.tip))
    add(painter, b.texture?.id, true,!!b.texture?.application)
    if (painter === 'stamp') { add('stamp', 'cloud', true); add('stamp', 'grit', true) }
    const dual = b.behavior?.dual
    if (!dual) return
    if (dual.sampling === 'independent') visit(dual.brush, 'stamp')
    else if (painter === 'stamp') visit(dual.brush, 'stamp', true)
    else {
      if(dual.brush.tip.profile?.kind==='gaussian') throw Error('Procedural dual profile requires the stamp renderer')
      if(dual.brush.tip.material) throw Error('Lightness dual material requires the stamp renderer')
      for (const id of dual.brush.tip.animation?.frames ?? (brushTipSamplerId(dual.brush.tip) ? [brushTipSamplerId(dual.brush.tip)!] : [])) add('wet', id, false, false, undefined, dual.brush.tip)
      if(dual.brush.texture?.application)add('wet',dual.brush.texture.id,true,true)
    }
  }
  visit(brush, brush.model === 'mixer' ? 'wet' : 'stamp')
  return { resources: [...resources.values()], capabilities: [...capabilities] }
}

export function brushPreparationResources(brush: BrushDescriptor): BrushPreparationResource[] {
  return brushPreparationPlan(brush).resources
}

export function brushPreparationBytes(resources: readonly BrushPreparationResource[], size: (id: string) => number): number {
  return resources.reduce((total, resource) => {
    if (resource.lookup32) return total + size(resource.id) ** 2
    if (resource.nativeImage) return total + resource.nativeImage.width * resource.nativeImage.height * 4
    if(resource.materialGroup)return total+materialGroupBytes(resource.materialGroup).gpu
    let side = size(resource.id), bytes = 0
    while (side >= 1) { bytes += side * side * 4; if(resource.discrete)break; side = Math.floor(side / 2) }
    return total + bytes
  }, 0)
}

/** Native policy promises a complete finite working bank, never a legacy
 * lazy-upload fallback after readiness reported an oversized skip. */
export function assertNativeImageAdmission(resources: readonly BrushPreparationResource[], maximumTextureSide: number): void {
  if (!resources.some(resource => resource.nativeImage || resource.lookup32)) return
  const bytes = brushPreparationBytes(resources, id => id.startsWith('asset:') ? Math.sqrt(importedAssetPixels(id).length) : 256)
  if (bytes > BRUSH_PREPARATION_BYTES) throw Error('Native image bank exceeds the brush texture budget')
  for (const resource of resources) {
    if (resource.lookup32 && (!Number.isFinite(maximumTextureSide) || Math.sqrt(importedAssetPixels(resource.id).length)/2 > maximumTextureSide)) throw Error('Radial curve exceeds GPU texture dimension limit')
    const image = resource.nativeImage
    if (!image) continue
    if (!Number.isFinite(maximumTextureSide) || image.width > maximumTextureSide || image.height > maximumTextureSide) throw Error('Native image bank exceeds the GPU texture dimension limit')
    if (image.nativeWidth > 4096 || image.nativeHeight > 4096 || image.width * image.height > 4 * 1024 * 1024) throw Error('Native image bank exceeds the CPU derivative dimensions budget')
  }
}

/** Cheap metadata-only batch pin plan; CPU mip arrays are not built here. */
export function brushTextureLeaseResources(brush: BrushDescriptor, painter: 'stamp' | 'wet'): { key: string; bytes: number }[] {
  return brushTextureLeasePlan(brushPreparationResources(painter === 'stamp' && brush.model === 'mixer' ? { ...brush, model: 'stamp' } : brush), painter)
}

/** Reuse a single paint-local plan for admission and pinning. */
export function brushTextureLeasePlan(resources: readonly BrushPreparationResource[], painter: 'stamp' | 'wet'): { key: string; bytes: number }[] {
  return resources.filter(resource => resource.painter === painter)
    .map(resource => ({ key: brushTextureResourceKey(resource), bytes: brushPreparationBytes([resource], id => id.startsWith('asset:') ? Math.sqrt(importedAssetPixels(id).length) : 256) }))
}

export type BrushPreparationOutcome = { readonly result: Readonly<BrushPreparationResult> } | { readonly error: unknown }
/** Creator-owned synchronous commit/rollback; late subscribers never replace it. */
export type BrushPreparationFinalizer = (outcome: BrushPreparationOutcome) => void
interface PreparationSubscriber {
  settle: (outcome: BrushPreparationOutcome) => void
  withdraw: (outcome: BrushPreparationOutcome) => void
  progress?: (done: number, total: number) => void
}
interface PreparationRun {
  key?: string
  done: number
  total: number
  finished: boolean
  subscribers: Set<PreparationSubscriber>
  finish: (outcome: BrushPreparationOutcome) => void
}
const cancelledPreparation: BrushPreparationOutcome = { result: { status: 'cancelled' } }

/** One upload per frame. Shared work owns finalization; each caller owns only
 * its cancellation/progress subscription. Allocate candidates in the first job,
 * never before run's early-return or same-key subscription paths.
 */
export class BrushPreparation {
  private active?: PreparationRun
  /** Read-only scheduling hint, not a reservation or execution grant. */
  canRunWithoutReplacing(key?: string): boolean { return !this.active || key !== undefined && this.active.key === key }
  cancel(): void { this.active?.finish(cancelledPreparation) }

  private subscribe(run: PreparationRun, options: BrushPreparationOptions): Promise<BrushPreparationResult> {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (outcome: BrushPreparationOutcome) => {
        if (settled) return
        settled = true
        options.signal?.removeEventListener('abort', abort)
        run.subscribers.delete(subscriber)
        if ('error' in outcome) reject(outcome.error); else resolve(outcome.result)
      }
      const withdraw = (outcome: BrushPreparationOutcome) => {
        // A terminal work outcome has already won, even if its finalizer
        // reenters an AbortController before subscriber promises settle.
        if (settled || run.finished) return
        if (run.subscribers.size === 1 && run.subscribers.has(subscriber)) run.finish(outcome)
        else settle(outcome)
      }
      const abort = () => withdraw(cancelledPreparation)
      const subscriber: PreparationSubscriber = { settle, withdraw, progress: options.onProgress }
      run.subscribers.add(subscriber)
      if (options.signal?.aborted) { abort(); return }
      options.signal?.addEventListener('abort', abort, { once: true })
      if (run.done && subscriber.progress) {
        try { subscriber.progress(run.done, run.total) }
        catch (error) { withdraw({ error }) }
      }
    })
  }

  private joinReentrant(key: string | undefined, options: BrushPreparationOptions, available: () => boolean): Promise<BrushPreparationResult> {
    const current = this.active
    if (key === undefined || !current || current.key !== key) return Promise.resolve({ status: 'cancelled' })
    try {
      const ready = available()
      if (!ready || current.finished || this.active !== current) return Promise.resolve({ status: 'cancelled' })
      return this.subscribe(current, options)
    } catch (error) { return Promise.reject(error) }
  }

  run(jobs: readonly (() => void)[], options: BrushPreparationOptions, available: () => boolean, key?: string,
    finalize?: BrushPreparationFinalizer): Promise<BrushPreparationResult> {
    if (options.signal?.aborted) return Promise.resolve({ status: 'cancelled' })
    const previous = this.active
    try { if (!available()) return Promise.resolve({ status: 'cancelled' }) }
    catch (error) { return Promise.reject(error) }
    // Availability may invoke owner callbacks. A newer reentrant run wins.
    if (this.active !== previous) return this.joinReentrant(key, options, available)
    if (key !== undefined && this.active?.key === key) return this.subscribe(this.active, options)
    this.cancel()
    // Cancelling the old creator can start a new run from its finalizer. Never
    // overwrite it and strand its jobs/subscribers; joining adds no cleanup.
    if (this.active) return this.joinReentrant(key, options, available)
    let frame: number | undefined
    const run: PreparationRun = {
      key, done: 0, total: jobs.length, finished: false, subscribers: new Set(),
      finish: outcome => {
        if (run.finished) return
        run.finished = true
        const pendingFrame = frame; frame = undefined
        if (this.active === run) this.active = undefined
        let terminal = outcome
        const fail = (error: unknown) => { if (!('error' in terminal)) terminal = { error } }
        if (pendingFrame !== undefined) {
          try { cancelAnimationFrame(pendingFrame) } catch (error) { fail(error) }
        }
        try {
          const view: BrushPreparationOutcome = 'error' in terminal
            ? Object.freeze({ error: terminal.error }) : Object.freeze({ result: Object.freeze({ ...terminal.result }) })
          if (finalize?.(view) !== undefined) throw new TypeError('Brush preparation finalizer must return undefined synchronously')
        } catch (error) { fail(error) }
        for (const subscriber of [...run.subscribers]) subscriber.settle(terminal)
      },
    }
    this.active = run
    const pending = this.subscribe(run, options)
    const finishReady = () => {
      const ready = available()
      if (run.finished || this.active !== run) return
      run.finish(ready ? { result: { status: 'ready' } } : cancelledPreparation)
    }
    const step = () => {
      frame = undefined
      if (run.finished) return
      try {
        const ready = available()
        if (run.finished || this.active !== run) return
        if (!ready) { run.finish(cancelledPreparation); return }
        jobs[run.done]?.()
        if (run.finished || this.active !== run) return
        if (run.done < jobs.length) run.done++
        for (const subscriber of [...run.subscribers]) {
          if (run.finished) break
          if (!run.subscribers.has(subscriber)) continue
          try { subscriber.progress?.(run.done, jobs.length) }
          catch (error) { subscriber.withdraw({ error }) }
        }
        if (run.finished || this.active !== run) return
        if (run.done === jobs.length) finishReady()
        else frame = requestAnimationFrame(step)
      } catch (error) { run.finish({ error }) }
    }
    if (!run.finished) {
      try {
        if (!jobs.length) finishReady()
        else frame = requestAnimationFrame(step)
      } catch (error) { run.finish({ error }) }
    }
    return pending
  }
}
