import { readRoomRasterVersion, type Operation } from '@grafetto/shared'

/** Exhaustive compile-time list of the existing durable discriminants. Legacy
 * field/codec variants keep their type; there is no arbitrary unknown-type
 * extension contract. New types must add a real admission path deliberately. */
const known: Record<Operation['type'], true> = {
  canonical_stroke_close:true, canonical_stroke: true, stroke: true, layer_add: true, image_import: true, folder_add: true,
  layer_delete: true, layer_move: true, layer_opacity: true, layer_visibility: true,
  layer_rename: true, layer_owner_lock: true, layer_lock: true, layer_clear: true,
  layer_merge: true, layer_duplicate: true, layer_transform: true,
  area_transform: true, area_clear: true, area_paste: true, area_fill: true,
  shape: true, layer_filter: true, operation_revoke: true, operation_undo: true,
  operation_redo: true, annotation_add: true, annotation_update: true,
  annotation_delete: true, paper_dry: true,
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** New canonical transport has its own discriminator and authority. It may not
 * ride a legacy stroke/live packet to bypass that gate. Canonical routes use their
 * concrete coordinator, never this legacy discriminant guard. */
export function hasReservedCanonicalFields(value: unknown): boolean {
  return object(value) && (value.type === 'canonical_stroke_close' || value.type === 'canonical_stroke' || value.type === 'canonical_stroke_live'
    || ['canonicalFrame', 'materialPacked', 'rasterProfile'].some(key => Object.hasOwn(value, key))
    || Object.hasOwn(value, 'frame') && value.type !== 'shape')
}
export function hasKnownOperationDiscriminant(value: unknown): boolean {
  return object(value) && Object.hasOwn(value, 'type') && typeof value.type === 'string' && Object.hasOwn(known, value.type) && !hasReservedCanonicalFields(value)
}

// Temporary writer compatibility boundary, NOT a claim of full straight-room
// support. Clear is byte-neutral but still needs active-wash serialization;
// keep it closed with other pixel writers until that client path is audited.
const legacyPixelWriters = new Set<Operation['type']>(['stroke', 'image_import', 'layer_clear', 'layer_merge', 'layer_duplicate',
  'layer_transform', 'area_transform', 'area_clear', 'area_paste', 'area_fill', 'shape', 'layer_filter'])
export function hasCompatibleLegacyWriter(rasterVersion: unknown, op: Operation): boolean {
  try { return readRoomRasterVersion(rasterVersion) === 'legacy-pm8-v1' || !legacyPixelWriters.has(op.type) } catch { return false }
}
