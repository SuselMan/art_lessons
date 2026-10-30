/** Requested AccumulationBuffer storage admission, NOT a complete GPU budget.
 * No GL handles/callbacks are retained. Raw textures, driver overhead and CPU
 * arrays are outside this first migrated domain. */
export interface AccumStoragePolicy { readonly limitBytes: number }
export interface AccumStorageSnapshot {
  readonly residentBytes: number
  readonly reservedBytes: number
  readonly orphanBytes: number
  readonly limitBytes: number
  readonly complete: false
}
export interface StorageReservation { readonly kind: 'accum-storage-reservation' }
export interface StorageLease { readonly kind: 'accum-storage-lease' }
interface Owner { resident: number; reserved: number; orphan: number; limit: number; active: boolean; attached: boolean }
interface Reservation { owner: Owner; remaining: number }
interface Lease { owner: Owner; bytes: number }
const owners = new WeakMap<WebGLRenderingContext, Owner>()
const reservations = new WeakMap<StorageReservation, Reservation>()
const leases = new WeakMap<StorageLease, Lease>()
function bytes(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid Accum storage bytes')
}
function ownerFor(gl: WebGLRenderingContext): Owner {
  let owner = owners.get(gl)
  if (!owner) { owner = { resident: 0, reserved: 0, orphan: 0, limit: Infinity, active: true, attached: false }; owners.set(gl, owner) }
  return owner
}
/** Reuses the actual context epoch, including allocations made by another engine.
 * A finite policy constrains only migrated Accum storage, never the whole GPU. */
export function attachAccumStorage(gl: WebGLRenderingContext, policy: AccumStoragePolicy = { limitBytes: Infinity }): void {
  if (policy.limitBytes !== Infinity) bytes(policy.limitBytes)
  const owner = ownerFor(gl)
  if (owner.attached && owner.limit !== policy.limitBytes) throw new Error('Accum storage policy mismatch on shared context')
  if (owner.resident + owner.reserved > policy.limitBytes) throw new Error('Existing Accum storage exceeds requested policy')
  owner.limit = policy.limitBytes; owner.attached = true
}
export function snapshotAccumStorage(gl: WebGLRenderingContext): Readonly<AccumStorageSnapshot> {
  const owner = owners.get(gl)
  return Object.freeze({ residentBytes: owner?.resident ?? 0, reservedBytes: owner?.reserved ?? 0, orphanBytes: owner?.orphan ?? 0, limitBytes: owner?.limit ?? Infinity, complete: false })
}
export function forgetAccumStorage(gl: WebGLRenderingContext): void {
  const owner = owners.get(gl)
  if (owner) { owner.active = false; owner.resident = owner.reserved = owner.orphan = 0 }
  if (owner) owners.set(gl, { resident: 0, reserved: 0, orphan: 0, limit: owner.limit, active: true, attached: owner.attached })
  else owners.delete(gl)
}
export function reserveAccumStorage(gl: WebGLRenderingContext, amount: number): StorageReservation {
  bytes(amount)
  const owner = ownerFor(gl)
  if (!Number.isSafeInteger(owner.resident + owner.reserved + amount) || amount > owner.limit - owner.resident - owner.reserved) throw new Error('Accum storage admission denied')
  const token: StorageReservation = Object.freeze({ kind: 'accum-storage-reservation' })
  owner.reserved += amount; reservations.set(token, { owner, remaining: amount })
  return token
}
export function validateAccumReservation(gl: WebGLRenderingContext, token: StorageReservation, amount: number): void {
  bytes(amount)
  const record = reservations.get(token)
  if (!record || !record.owner.active || record.owner !== owners.get(gl) || record.remaining < amount) throw new Error('Invalid Accum storage reservation')
}
export function materializeAccumStorage(gl: WebGLRenderingContext, token: StorageReservation, amount: number): StorageLease {
  validateAccumReservation(gl, token, amount)
  const record = reservations.get(token)!
  record.remaining -= amount; record.owner.reserved -= amount; record.owner.resident += amount
  const lease: StorageLease = Object.freeze({ kind: 'accum-storage-lease' })
  leases.set(lease, { owner: record.owner, bytes: amount })
  return lease
}
export function releaseAccumReservation(token: StorageReservation): void {
  const record = reservations.get(token)
  if (!record) return
  reservations.delete(token)
  if (record.owner.active) record.owner.reserved -= record.remaining
}
/** deletionConfirmed=false keeps a conservative numeric charge until context loss. */
export function releaseAccumLease(token: StorageLease, deletionConfirmed: boolean): void {
  const record = leases.get(token)
  if (!record) return
  leases.delete(token)
  if (!record.owner.active) return
  if (deletionConfirmed) record.owner.resident -= record.bytes
  else record.owner.orphan += record.bytes
}
/** Failed construction must not consume an external promise. Unknown live storage
 * instead becomes an explicit conservative numeric charge, with no handle journal. */
export function chargeAccumOrphan(gl: WebGLRenderingContext, amount: number): void {
  bytes(amount)
  const owner = ownerFor(gl)
  owner.resident += amount; owner.orphan += amount
}

export function isAccumLeaseCurrent(gl: WebGLRenderingContext, token: StorageLease | undefined): boolean {
  if (!token) return false
  const record = leases.get(token)
  return !!record && record.owner.active && record.owner === owners.get(gl)
}
