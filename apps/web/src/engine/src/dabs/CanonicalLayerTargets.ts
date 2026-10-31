import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { RibbonScratchPool,RibbonScratchRequest,RibbonScratchAcquisition } from '../buffers/RibbonScratchPool'
import type { WorldRect } from '../buffers/tileMath'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import type { BrushGlBatchLifetimeFramebuffer } from './BrushGlBatch'
import type { CanonicalOwnedRgba8Target } from './CanonicalRgba8CompositePass'

/** Metadata-only binding to real, authoritative straight layer tiles. A binding
 * does not keep textures resident: each synchronous batch acquires its shared
 * lifetime, then releases before yielding. A later acquire revalidates exact
 * tile allocation identities, so reset/eviction cannot reuse a stale binding. */
export function bindCanonicalLayerTargets(layer: TiledLayerBuffer, targets: readonly PaintTarget[]): readonly CanonicalOwnedRgba8Target[] {
  if (layer.pixelEncoding !== 'straight-rgba8') throw new TypeError('Canonical targets require straight RGBA8 layer storage')
  if (!Array.isArray(targets) || targets.length > 64) throw new RangeError('Invalid canonical layer target capacity')
  const snapshot = targets.map(target => {
    if (!target || target.buffer?.pixelEncoding !== 'straight-rgba8') throw new TypeError('Canonical targets require straight RGBA8 buffers')
    return Object.freeze({ ...target })
  })
  // Validate the whole set before exposing target handles; this is metadata
  // only and deliberately does not trigger an eviction sweep on release.
  layer.retainTargets(snapshot)()
  const layouts=new Map<PaintTarget['buffer'],BrushGlBatchLifetimeFramebuffer>()
  for(const {buffer,originX,originY}of snapshot){
    const certificate=buffer.verifiedFramebufferLayout
    if(!certificate)throw new Error('Canonical layer target lacks a current fixed framebuffer certificate')
    if(!layouts.has(buffer))layouts.set(buffer,Object.freeze({source:buffer,certificate,originX,originY}))
  }
  const lifetime = Object.freeze({ kind: 'external' as const, owner: Object.freeze({}), ownedFramebufferLayouts:Object.freeze([...layouts.values()]), lease: () => layer.retainTargets(snapshot) })
  return Object.freeze(snapshot.map(({ buffer, originX, originY }) => Object.freeze({
    brand: 'canonical-straight-rgba8-v1' as const,
    texture: buffer.texture, framebuffer: buffer.fbo, width: buffer.width, height: buffer.height,
    originX, originY, lifetime,
  })))
}

/** Physical tickets, separate from the engine's logical transient fence. This
 * wrapper owns taken scratch until explicit transfer; no draw lease crosses a
 * turn. Layer storage remains layer-owned even when a partial plan is closed. */
export function prepareCanonicalLayerFrame(layer:TiledLayerBuffer,pool:RibbonScratchPool,rects:readonly Readonly<WorldRect>[],requests:readonly RibbonScratchRequest[]):CanonicalLayerFrame {
  if(layer.pixelEncoding!=='straight-rgba8')throw new TypeError('Canonical targets require straight RGBA8 layer storage')
  const targets=layer.preparePaintTargetRects(rects)
  let scratch:RibbonScratchAcquisition|undefined
  try{if(requests.length)scratch=pool.prepareAcquisition(requests)}catch(primary){try{targets.close()}catch{/* Preserve acquisition error. */}throw primary}
  const owned=new Map<number,AccumulationBuffer>()
  let closed=false
  const current=()=>{if(closed)throw new Error('Closed canonical layer frame')}
  return Object.freeze({targetCount:targets.length,scratchCount:requests.length,
    takeTarget(index:number){current();return targets.take(index)},
    takeResidentTarget(index:number){current();return targets.takeResident(index)},
    takeScratch(index:number){current();if(owned.has(index))throw new Error('Scratch admission already taken');const buffer=scratch!.take(index);owned.set(index,buffer);return buffer},
    takeResidentScratch(index:number){current();if(owned.has(index))throw new Error('Scratch admission already taken');const buffer=scratch!.takeResident(index);if(buffer)owned.set(index,buffer);return buffer},
    scratchAt(index:number){current();const buffer=owned.get(index);if(!buffer)throw new Error('Scratch admission not owned');return buffer},
    transferScratch(index:number){current();const buffer=owned.get(index);if(!buffer)throw new Error('Scratch admission not owned');owned.delete(index);return buffer},
    close(options:{lost?:boolean}={}){if(closed)return;closed=true;let failed=false,error:unknown
      const clean=(f:()=>void)=>{try{f()}catch(e){if(!failed){failed=true;error=e}}}
      for(const buffer of owned.values())if(!options.lost)clean(()=>pool.release(buffer));owned.clear()
      clean(()=>scratch?.close());clean(()=>targets.close());if(failed)throw error
    }})
}
export interface CanonicalLayerFrame {
 readonly targetCount:number
 readonly scratchCount:number
 takeTarget(index:number):PaintTarget
 takeResidentTarget(index:number):PaintTarget|undefined
 takeScratch(index:number):AccumulationBuffer
 takeResidentScratch(index:number):AccumulationBuffer|undefined
 scratchAt(index:number):AccumulationBuffer
 transferScratch(index:number):AccumulationBuffer
 close(options?:{lost?:boolean}):void
}
