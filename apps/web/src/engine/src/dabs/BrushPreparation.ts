import { importedAssetPixels } from '../presets/importedBrushes'
import type { BrushDescriptor, BrushTextureId, TipMaskId } from '@grafetto/shared'

export interface BrushPreparationResource { painter: 'stamp' | 'wet'; id: TipMaskId | BrushTextureId; grain: boolean; discrete?: true }
export interface BrushPreparationOptions { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }
export interface BrushPreparationResult { status: 'ready' | 'skipped' | 'cancelled' }
export const brushTextureResourceKey = (resource: Pick<BrushPreparationResource,'id'|'grain'|'discrete'>): string => `${resource.grain ? resource.discrete ? 'g:grid' : 'g' : 't'}:${resource.id}`
export const BRUSH_PREPARATION_BYTES = 16 * 1024 * 1024

/** Matches sampler routes, rather than uploading both formats for every tip. */
export function brushPreparationResources(brush: BrushDescriptor): BrushPreparationResource[] {
  const resources = new Map<string, BrushPreparationResource>()
  const add = (painter: 'stamp' | 'wet', id: TipMaskId | BrushTextureId | undefined, grain = false, discrete = false) => {
    if (id) resources.set(`${painter}:${grain}:${discrete}:${id}`, { painter, id, grain, ...(discrete ? {discrete:true as const} : {}) })
  }
  const visit = (b: BrushDescriptor, painter: 'stamp' | 'wet') => {
    for (const id of b.tip.animation?.frames ?? (b.tip.mask ? [b.tip.mask] : [])) add(painter, id)
    add(painter, b.texture?.id, true,!!b.texture?.application)
    if (painter === 'stamp') { add('stamp', 'cloud', true); add('stamp', 'grit', true) }
    const dual = b.behavior?.dual
    if (!dual) return
    if (dual.sampling === 'independent') visit(dual.brush, 'stamp')
    else if (painter === 'stamp') visit(dual.brush, 'stamp')
    else {
      for (const id of dual.brush.tip.animation?.frames ?? (dual.brush.tip.mask ? [dual.brush.tip.mask] : [])) add('wet', id)
      if(dual.brush.texture?.application)add('wet',dual.brush.texture.id,true,true)
    }
  }
  visit(brush, brush.model === 'mixer' ? 'wet' : 'stamp')
  return [...resources.values()]
}

export function brushPreparationBytes(resources: readonly BrushPreparationResource[], size: (id: string) => number): number {
  return resources.reduce((total, resource) => {
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
