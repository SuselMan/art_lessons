import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
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
  const lifetime = Object.freeze({ kind: 'external' as const, owner: Object.freeze({}), lease: () => layer.retainTargets(snapshot) })
  return Object.freeze(snapshot.map(({ buffer, originX, originY }) => Object.freeze({
    brand: 'canonical-straight-rgba8-v1' as const,
    texture: buffer.texture, framebuffer: buffer.fbo, width: buffer.width, height: buffer.height,
    originX, originY, lifetime,
  })))
}
