import { materialPackingPlan, materialGroupBytes, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { importedAssetPixels } from '../presets/importedBrushes'
import type { BrushDescriptor, BrushTip, BrushTextureId, TipMaskId } from '@grafetto/shared'

export interface BrushPreparationResource { painter: 'stamp' | 'wet'; id: TipMaskId | BrushTextureId; grain: boolean; gray?: string; discrete?: true; materialGroup?: MaterialTextureGroup; materialChannels?: 'ra' | 'rg' | 'ba' }
export interface BrushPreparationOptions { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }
export interface BrushPreparationResult { status: 'ready' | 'skipped' | 'cancelled' }
export const brushTextureResourceKey = (resource: Pick<BrushPreparationResource,'id'|'grain'|'discrete'|'gray'|'materialGroup'>): string => resource.materialGroup?.key ?? (resource.gray ? `t:lightness:${resource.id}:${resource.gray}` : `${resource.grain ? resource.discrete ? 'g:grid' : 'g' : 't'}:${resource.id}`)
export const BRUSH_PREPARATION_BYTES = 16 * 1024 * 1024

const materialPlans = new WeakMap<BrushTip, ReturnType<typeof materialPackingPlan>>()
/** One physical resource resolver for preparation, pinning and render lookup. */
export function brushTipResource(id: TipMaskId, gray?: string, tip?: BrushTip): Omit<BrushPreparationResource,'painter'> {
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
  capabilities: ('stamp' | 'wet')[]
} {
  const capabilities = new Set<'stamp' | 'wet'>()
  const resources = new Map<string, BrushPreparationResource>()
  const add = (painter: 'stamp' | 'wet', id: TipMaskId | BrushTextureId | undefined, grain = false, discrete = false, gray?: string, tip?: BrushTip) => {
    if (id) {
      const resource:BrushPreparationResource={painter,...(grain ? {id,grain,...(discrete ? {discrete:true as const} : {})} : brushTipResource(id as TipMaskId,gray,tip))}
      resources.set(`${painter}:${brushTextureResourceKey(resource)}`,resource)
    }
  }
  const visit = (b: BrushDescriptor, painter: 'stamp' | 'wet') => {
    if(b.tip.profile?.kind==='gaussian' && painter==='wet') throw Error('Procedural tip profile requires the stamp renderer')
    if(b.tip.material && painter==='wet') throw Error('Lightness tip material requires the stamp renderer')
    const inline = b.behavior?.dual?.sampling !== 'independent' ? b.behavior?.dual?.brush : undefined
    if (painter === 'stamp'
      ? b.tip.kind === 'procedural' || inline?.tip.kind === 'procedural'
      : b.tip.profile?.kind === 'standard' || inline?.tip.profile?.kind === 'standard') capabilities.add(painter)
    const frames=b.tip.animation?.frames ?? (b.tip.mask ? [b.tip.mask] : [])
    frames.forEach((id,index)=>add(painter,id,false,false,b.tip.material?.grayFrames?.[index] ?? b.tip.material?.gray,b.tip))
    add(painter, b.texture?.id, true,!!b.texture?.application)
    if (painter === 'stamp') { add('stamp', 'cloud', true); add('stamp', 'grit', true) }
    const dual = b.behavior?.dual
    if (!dual) return
    if (dual.sampling === 'independent') visit(dual.brush, 'stamp')
    else if (painter === 'stamp') visit(dual.brush, 'stamp')
    else {
      if(dual.brush.tip.profile?.kind==='gaussian') throw Error('Procedural dual profile requires the stamp renderer')
      if(dual.brush.tip.material) throw Error('Lightness dual material requires the stamp renderer')
      for (const id of dual.brush.tip.animation?.frames ?? (dual.brush.tip.mask ? [dual.brush.tip.mask] : [])) add('wet', id)
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
    if(resource.materialGroup)return total+materialGroupBytes(resource.materialGroup).gpu
    let side = size(resource.id), bytes = 0
    while (side >= 1) { bytes += side * side * 4; if(resource.discrete)break; side = Math.floor(side / 2) }
    return total + bytes
  }, 0)
}

/** Cheap metadata-only batch pin plan; CPU mip arrays are not built here. */
export function brushTextureLeaseResources(brush: BrushDescriptor, painter: 'stamp' | 'wet'): { key: string; bytes: number }[] {
  return brushPreparationResources(painter === 'stamp' && brush.model === 'mixer' ? { ...brush, model: 'stamp' } : brush)
    .filter(resource => resource.painter === painter)
    .map(resource => ({ key: brushTextureResourceKey(resource), bytes: brushPreparationBytes([resource], id => id.startsWith('asset:') ? Math.sqrt(importedAssetPixels(id).length) : 256) }))
}

/** Only one CPU-mips/upload job per animation frame; no stroke state is touched. */
export class BrushPreparation {
  private cancelPending: (() => void) | undefined
  cancel(): void { this.cancelPending?.() }
  run(jobs: readonly (() => void)[], options: BrushPreparationOptions, available: () => boolean): Promise<BrushPreparationResult> {
    this.cancel()
    return new Promise((resolve, reject) => {
      let frame = 0, done = 0, finished = false
      const finish = (result: BrushPreparationResult, error?: unknown) => {
        if (finished) return
        finished = true
        if (frame) cancelAnimationFrame(frame)
        options.signal?.removeEventListener('abort', cancel)
        if (this.cancelPending === cancel) this.cancelPending = undefined
        if (error !== undefined) reject(error); else resolve(result)
      }
      const cancel = () => finish({ status: 'cancelled' })
      this.cancelPending = cancel
      options.signal?.addEventListener('abort', cancel, { once: true })
      const step = () => {
        frame = 0
        if (options.signal?.aborted || !available()) { cancel(); return }
        try {
          jobs[done]?.()
          if (done < jobs.length) done++
          options.onProgress?.(done, jobs.length)
          if (finished) return
          if (done === jobs.length) finish({ status: 'ready' })
          else frame = requestAnimationFrame(step)
        } catch (error) { finish({ status: 'cancelled' }, error) }
      }
      if (options.signal?.aborted || !available()) cancel()
      else if (!jobs.length) finish({ status: 'ready' })
      else frame = requestAnimationFrame(step)
    })
  }
}
