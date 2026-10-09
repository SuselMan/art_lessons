import type { CanonicalWatercolorWebGpu } from './backend'
import { createCanonicalSettleField, destroyCanonicalSettleField, type CanonicalSettleField } from './fieldBuffer'

/** Native counterpart of _diffuseFieldFor. One serial settle owns these fields;
 * the caller must finish/dispose it before asking for another capture. */
export class CanonicalPlanFieldOwner {
 private readonly backend: CanonicalWatercolorWebGpu
 private current: CanonicalSettleField | null = null
 /** Read-only existing allocation passport; no fieldFor/clear/allocation. */
 get existingFieldForOwnership(){return this.current}
 private disposed = false
 constructor(backend: CanonicalWatercolorWebGpu) { this.backend = backend }
 fieldFor(width: number, height: number, captureClearsInputs = false): CanonicalSettleField {
  if (this.disposed) throw new Error('Canonical planner fields destroyed')
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Invalid canonical planner extent')
  // Preserve production 1536 minimum and 256 rounding. A compact shader test
  // field is not interchangeable with a production settle field.
  const need = (n: number) => Math.max(1536, Math.ceil(n / 256) * 256)
  const w = need(width), h = need(height)
  if (this.current && (this.current.w !== w || this.current.h !== h)) {
   destroyCanonicalSettleField(this.current)
   this.current = null
  }
  const field = this.current ??= createCanonicalSettleField(this.backend, w, h)
  // These five inputs are overwritten during original planner capture. Every
  // other scratch role must be clean; don't skip clear by inferred emptiness.
  const buffers = captureClearsInputs
   ? [field.c, field.cc, field.mask, field.pressure, field.band]
   : [field.a, field.b, field.c, field.coverage, field.ca, field.cb, field.cc, field.mask, field.pressure, field.band]
  for (const buffer of buffers) buffer.clear()
  return field
 }
 destroy() {
  if (this.disposed) return
  this.disposed = true
  if (this.current) destroyCanonicalSettleField(this.current)
  this.current = null
 }
}
