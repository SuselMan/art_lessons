import { radialCurveTextureSide } from '../raster/radialCurve'
import { proceduralProfileUniforms } from '../raster/brushProcedural'
import { nativeImageBank, type NativeImageResource } from './NativeImageBank'
import { materialPackingPlan, materialGroupBytes, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { importedAssetPixels } from '../presets/importedBrushes'
import {brushTipColorPlanes,isBrushGradient,type BrushDescriptor,type BrushTip,type BrushTextureId,type TipMaskId} from '@grafetto/shared'

export interface BrushPreparationResource { painter: 'stamp' | 'wet'; gradientMap?:true;gradientLut?:string;colorPlanes?: readonly [string,string,string]; id: TipMaskId | BrushTextureId; grain: boolean; gray?: string; discrete?: true; materialGroup?: MaterialTextureGroup; materialChannels?: 'ra' | 'rg' | 'ba'; nativeImage?: NativeImageResource; lookup32?: true }
export interface BrushPreparationOptions { gradient?:string;signal?: AbortSignal; onProgress?: (done: number, total: number) => void }
export interface BrushPreparationResult { status: 'ready' | 'skipped' | 'cancelled' }
export const brushTextureResourceKey = (resource: Pick<BrushPreparationResource,'id'|'grain'|'discrete'|'gray'|'materialGroup'|'nativeImage'|'lookup32'|'colorPlanes'|'gradientMap'|'gradientLut'>): string => (resource.gradientMap ? `t:gradient:${resource.id}:${resource.colorPlanes?.[0]}:${resource.gradientLut ?? 'unbound'}` : undefined) ?? (resource.colorPlanes ? `t:rgba:${resource.id}:${resource.colorPlanes.join(':')}` : undefined) ?? (resource.lookup32 ? `t:lookup32:${resource.id}` : undefined) ?? resource.nativeImage?.key ?? resource.materialGroup?.key ?? (resource.gray ? `t:lightness:${resource.id}:${resource.gray}` : `${resource.grain ? resource.discrete ? 'g:grid' : 'g' : 't'}:${resource.id}`)
export function bindBrushGradient(resources:readonly BrushPreparationResource[],lut:string|undefined):BrushPreparationResource[] {
 return resources.map(resource=>{
  if(!resource.gradientMap)return resource
  if(!isBrushGradient(lut))throw Error('Gradient tip preparation requires a captured palette')
  return {...resource,gradientLut:lut}
 })
}
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
  capabilities: ('stamp' | 'wet' | 'stampImage' | 'wetImage' | 'stampCircleBand' | 'stampCurve' | 'wetCurve' | 'colorSmudge' | 'colorSmudgeMean' | 'projectionCanvas' | 'sprayShapes'|'sketchLines')[]
} {
  const capabilities = new Set<'stamp' | 'wet' | 'stampImage' | 'wetImage' | 'stampCircleBand' | 'stampCurve' | 'wetCurve' | 'colorSmudge' | 'colorSmudgeMean' | 'projectionCanvas' | 'sprayShapes'|'sketchLines'>()
  if(brush.sketch||brush.bristle)capabilities.add('sketchLines')
  if(brush.spray && brush.spray.particle.shape!=='tip')capabilities.add('sprayShapes')
  if(brush.mixer?.algorithm)capabilities.add('colorSmudge')
  if(brush.mixer?.source==='projectionCanvas')capabilities.add('projectionCanvas')
  if(brush.mixer?.sampling?.mode==='adaptiveMean')capabilities.add('colorSmudgeMean')
  const resources = new Map<string, BrushPreparationResource>()
  const add = (painter: 'stamp' | 'wet', id: TipMaskId | BrushTextureId | undefined, grain = false, discrete = false, gray?: string, tip?: BrushTip, colorPlanes?:readonly [string,string,string]) => {
    if (id) {
      if (!grain && tip?.imageSampling) {
        for (const nativeImage of nativeImageBank(id as TipMaskId, tip)) {
          const resource: BrushPreparationResource = { painter, id, grain: false, nativeImage }
          resources.set(`${painter}:${brushTextureResourceKey(resource)}`, resource)
        }
        return
      }
      const resource:BrushPreparationResource=colorPlanes ? {painter,id,grain:false,colorPlanes,...(tip?.color&&'gradient' in tip.color?{gradientMap:true as const}:{})} : {painter,...(grain ? {id,grain,...(discrete ? {discrete:true as const} : {})} : brushTipResource(id as TipMaskId,gray,tip))}
      resources.set(`${painter}:${brushTextureResourceKey(resource)}`,resource)
    }
  }
  const visit = (b: BrushDescriptor, painter: 'stamp' | 'wet', covered = false) => {
    if (b.tip.profile?.kind === 'circleBand') {
      if (painter !== 'stamp' || b.behavior?.rendering?.accumulation !== 'maxAlpha') throw Error('Circle band requires stamp max-alpha accumulation')
      capabilities.add('stampCircleBand')
    }
    if(b.tip.profile?.kind==='gaussian' && painter==='wet') throw Error('Procedural tip profile requires the stamp renderer')
    if(b.tip.material && painter==='wet' && !b.mixer?.paintThickness) throw Error('Lightness tip material requires a material renderer')
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
    frames.forEach((id,index)=>{
      const gray=b.tip.material?.grayFrames?.[index] ?? b.tip.material?.gray
      const colorPlanes=painter==='wet' && b.mixer?.paintThickness && gray ? [gray,gray,gray] as const : brushTipColorPlanes(b.tip,index)
      add(painter,id,false,false,gray,b.tip,colorPlanes)
    })
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
    if (resource.colorPlanes) return total + size(resource.id) ** 2 * 4
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

type PreparationOutcome = { result: BrushPreparationResult } | { error: unknown }
interface PreparationSubscriber {
  finish: (outcome: PreparationOutcome) => void
  progress?: (done: number, total: number) => void
}
interface PreparationRun {
  key?: string
  done: number
  total: number
  finished: boolean
  subscribers: Set<PreparationSubscriber>
  finish: (outcome: PreparationOutcome) => void
}
const cancelledPreparation: PreparationOutcome = { result: { status: 'cancelled' } }

/** One upload per frame. A selected immutable preset may share its work, but
 * each caller owns its cancellation/progress subscription. No stroke state.
 */
export class BrushPreparation {
  private active?: PreparationRun
  cancel(): void { this.active?.finish(cancelledPreparation) }

  private subscribe(run: PreparationRun, options: BrushPreparationOptions): Promise<BrushPreparationResult> {
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (outcome: PreparationOutcome) => {
        if (settled) return
        settled = true
        options.signal?.removeEventListener('abort', abort)
        run.subscribers.delete(subscriber)
        if ('error' in outcome) reject(outcome.error); else resolve(outcome.result)
        if (!run.finished && !run.subscribers.size) run.finish(cancelledPreparation)
      }
      const abort = () => finish(cancelledPreparation)
      const subscriber: PreparationSubscriber = { finish, progress: options.onProgress }
      run.subscribers.add(subscriber)
      if (options.signal?.aborted) { abort(); return }
      options.signal?.addEventListener('abort', abort, { once: true })
      // Late joiners see the actual shared bank's progress, not a second
      // missing-resource plan's smaller total. An observer error is local.
      if (run.done && subscriber.progress) {
        try { subscriber.progress(run.done, run.total) }
        catch (error) { finish({ error }) }
      }
    })
  }

  run(jobs: readonly (() => void)[], options: BrushPreparationOptions, available: () => boolean, key?: string): Promise<BrushPreparationResult> {
    if (options.signal?.aborted) return Promise.resolve({ status: 'cancelled' })
    try { if (!available()) return Promise.resolve({ status: 'cancelled' }) }
    catch (error) { return Promise.reject(error) }
    if (key !== undefined && this.active?.key === key) return this.subscribe(this.active, options)
    this.cancel()
    let frame: number | undefined
    const run: PreparationRun = {
      key, done: 0, total: jobs.length, finished: false, subscribers: new Set(),
      finish: outcome => {
        if (run.finished) return
        run.finished = true
        if (frame !== undefined) cancelAnimationFrame(frame)
        if (this.active === run) this.active = undefined
        for (const subscriber of [...run.subscribers]) subscriber.finish(outcome)
      },
    }
    this.active = run
    const pending = this.subscribe(run, options)
    const step = () => {
      frame = undefined
      if (run.finished) return
      try {
        if (!available()) { run.finish(cancelledPreparation); return }
        jobs[run.done]?.()
        if (run.done < jobs.length) run.done++
        for (const subscriber of [...run.subscribers]) {
          // A preceding callback may abort another subscriber or cancel all.
          if (!run.subscribers.has(subscriber)) continue
          try { subscriber.progress?.(run.done, jobs.length) }
          catch (error) { subscriber.finish({ error }) }
        }
        if (run.finished) return
        if (run.done === jobs.length) run.finish({ result: { status: 'ready' } })
        else frame = requestAnimationFrame(step)
      } catch (error) { run.finish({ error }) }
    }
    if (!run.finished) {
      if (!jobs.length) run.finish({ result: { status: 'ready' } })
      else frame = requestAnimationFrame(step)
    }
    return pending
  }
}
