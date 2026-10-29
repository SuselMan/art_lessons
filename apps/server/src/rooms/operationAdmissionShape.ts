import type { Operation } from '@grafetto/shared'

/** Exhaustive compile-time list of the existing durable discriminants. Legacy
 * field/codec variants keep their type; there is no arbitrary unknown-type
 * extension contract. New types must add a real admission path deliberately. */
const known: Record<Operation['type'], true> = {
  stroke: true, layer_add: true, image_import: true, folder_add: true,
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
 * ride a legacy stroke/live packet to bypass that gate. No new route is opened. */
export function hasReservedCanonicalFields(value: unknown): boolean {
  return object(value) && (value.type === 'canonical_stroke' || value.type === 'canonical_stroke_live'
    || ['canonicalFrame', 'materialPacked', 'rasterProfile'].some(key => Object.hasOwn(value, key))
    || Object.hasOwn(value, 'frame') && value.type !== 'shape')
}
export function hasKnownOperationDiscriminant(value: unknown): boolean {
  return object(value) && Object.hasOwn(value, 'type') && typeof value.type === 'string' && Object.hasOwn(known, value.type) && !hasReservedCanonicalFields(value)
}
