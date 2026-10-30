/** Requested migrated storage charge, NOT a complete GPU budget.
 * Numeric records never retain GL handles/callbacks. Remaining raw writers,
 * driver overhead and CPU arrays are outside this incomplete domain. */
export type StorageDomain = 'accum-rgba8' | 'brush-texture-rgba-equivalent' | 'brush-buffer';
interface Counters {
    resident: number;
    reserved: number;
    orphan: number;
}
function domains(): Record<StorageDomain, Counters> { return { 'accum-rgba8': { resident: 0, reserved: 0, orphan: 0 }, 'brush-texture-rgba-equivalent': { resident: 0, reserved: 0, orphan: 0 }, 'brush-buffer': { resident: 0, reserved: 0, orphan: 0 } }; }
export interface AccumStoragePolicy {
    readonly limitBytes: number;
}
export interface AccumStorageSnapshot {
    readonly residentBytes: number;
    readonly reservedBytes: number;
    readonly orphanBytes: number;
    readonly limitBytes: number;
    readonly complete: false;
}
export interface StorageReservation {
    readonly kind: 'context-storage-reservation';
}
export interface StorageLease {
    readonly kind: 'context-storage-lease';
}
interface Owner {
    domains: Record<StorageDomain, Counters>;
    resident: number;
    reserved: number;
    orphan: number;
    limit: number;
    active: boolean;
    attached: boolean;
}
interface Reservation {
    domain: StorageDomain;
    owner: Owner;
    remaining: number;
}
interface Lease {
    domain: StorageDomain;
    owner: Owner;
    bytes: number;
}
const owners = new WeakMap<WebGLRenderingContext, Owner>();
const reservations = new WeakMap<StorageReservation, Reservation>();
const leases = new WeakMap<StorageLease, Lease>();
function bytes(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new RangeError('Invalid context storage bytes');
}
function ownerFor(gl: WebGLRenderingContext): Owner {
    let owner = owners.get(gl);
    if (!owner) {
        owner = { domains: domains(), resident: 0, reserved: 0, orphan: 0, limit: Infinity, active: true, attached: false };
        owners.set(gl, owner);
    }
    return owner;
}
/** Reuses the actual context epoch, including allocations made by another engine.
 * A finite policy constrains only migrated storage domains, never the whole GPU. */
export function attachContextStorage(gl: WebGLRenderingContext, policy: AccumStoragePolicy = { limitBytes: Infinity }): void {
    if (policy.limitBytes !== Infinity)
        bytes(policy.limitBytes);
    const owner = ownerFor(gl);
    if (owner.attached && owner.limit !== policy.limitBytes)
        throw new Error('Context storage policy mismatch on shared context');
    if (owner.resident + owner.reserved > policy.limitBytes)
        throw new Error('Existing context storage exceeds requested policy');
    owner.limit = policy.limitBytes;
    owner.attached = true;
}
export type ContextStoragePolicy = AccumStoragePolicy;
export interface ContextStorageSnapshot extends AccumStorageSnapshot {
    readonly domains: Readonly<Record<StorageDomain, Readonly<AccumStorageSnapshot>>>;
}
export function snapshotContextStorage(gl: WebGLRenderingContext): Readonly<ContextStorageSnapshot> {
    const owner = owners.get(gl), domain = owner?.domains ?? domains();
    const result = {} as Record<StorageDomain, Readonly<AccumStorageSnapshot>>;
    for (const key of Object.keys(domain) as StorageDomain[]) {
        const value = domain[key];
        result[key] = Object.freeze({ residentBytes: value.resident, reservedBytes: value.reserved, orphanBytes: value.orphan, limitBytes: owner?.limit ?? Infinity, complete: false });
    }
    return Object.freeze({ residentBytes: owner?.resident ?? 0, reservedBytes: owner?.reserved ?? 0, orphanBytes: owner?.orphan ?? 0, limitBytes: owner?.limit ?? Infinity, complete: false, domains: Object.freeze(result) });
}
export function snapshotAccumStorage(gl: WebGLRenderingContext): Readonly<AccumStorageSnapshot> { return snapshotContextStorage(gl).domains['accum-rgba8']; }
export const attachAccumStorage = attachContextStorage;
export const forgetAccumStorage = forgetContextStorage;
export function forgetContextStorage(gl: WebGLRenderingContext): void {
    const owner = owners.get(gl);
    if (owner) {
        owner.active = false;
        owner.resident = owner.reserved = owner.orphan = 0;
    }
    if (owner)
        owners.set(gl, { domains: domains(), resident: 0, reserved: 0, orphan: 0, limit: owner.limit, active: true, attached: owner.attached });
    else
        owners.delete(gl);
}
export function reserveContextStorage(gl: WebGLRenderingContext, amount: number, domain: StorageDomain): StorageReservation {
    bytes(amount);
    const owner = ownerFor(gl);
    if (!Object.hasOwn(owner.domains, domain))
        throw new Error('Invalid storage domain');
    if (!Number.isSafeInteger(owner.resident + owner.reserved + amount) || amount > owner.limit - owner.resident - owner.reserved)
        throw new Error('Context storage admission denied');
    const token: StorageReservation = Object.freeze({ kind: 'context-storage-reservation' });
    owner.reserved += amount;
    owner.domains[domain].reserved += amount;
    reservations.set(token, { owner, domain, remaining: amount });
    return token;
}
export function validateStorageReservation(gl: WebGLRenderingContext, token: StorageReservation, amount: number): void {
    bytes(amount);
    const record = reservations.get(token);
    if (!record || !record.owner.active || record.owner !== owners.get(gl) || record.remaining < amount)
        throw new Error('Invalid context storage reservation');
}
export function materializeContextStorage(gl: WebGLRenderingContext, token: StorageReservation, amount: number): StorageLease {
    validateStorageReservation(gl, token, amount);
    const record = reservations.get(token)!;
    record.remaining -= amount;
    record.owner.reserved -= amount;
    record.owner.resident += amount;
    record.owner.domains[record.domain].reserved -= amount;
    record.owner.domains[record.domain].resident += amount;
    const lease: StorageLease = Object.freeze({ kind: 'context-storage-lease' });
    leases.set(lease, { owner: record.owner, domain: record.domain, bytes: amount });
    return lease;
}
export function releaseStorageReservation(token: StorageReservation): void {
    const record = reservations.get(token);
    if (!record)
        return;
    reservations.delete(token);
    if (record.owner.active) {
        record.owner.reserved -= record.remaining;
        record.owner.domains[record.domain].reserved -= record.remaining;
    }
}
/** deletionConfirmed=false keeps a conservative numeric charge until context loss. */
export function releaseStorageLease(token: StorageLease, deletionConfirmed: boolean): void {
    const record = leases.get(token);
    if (!record)
        return;
    leases.delete(token);
    if (!record.owner.active)
        return;
    if (deletionConfirmed) {
        record.owner.resident -= record.bytes;
        record.owner.domains[record.domain].resident -= record.bytes;
    }
    else {
        record.owner.orphan += record.bytes;
        record.owner.domains[record.domain].orphan += record.bytes;
    }
}
/** Failed construction must not consume an external promise. Unknown live storage
 * instead becomes an explicit conservative numeric charge, with no handle journal. */
export function chargeContextOrphan(gl: WebGLRenderingContext, amount: number, domain: StorageDomain): void {
    bytes(amount);
    const owner = ownerFor(gl);
    if (!Object.hasOwn(owner.domains, domain))
        throw new Error('Invalid storage domain');
    owner.resident += amount;
    owner.orphan += amount;
    owner.domains[domain].resident += amount;
    owner.domains[domain].orphan += amount;
}
export function isStorageLeaseCurrent(gl: WebGLRenderingContext, token: StorageLease | undefined): boolean {
    if (!token)
        return false;
    const record = leases.get(token);
    return !!record && record.owner.active && record.owner === owners.get(gl);
}
// Accum compatibility names share this single ledger and fixed domain.
export function reserveAccumStorage(gl: WebGLRenderingContext, amount: number): StorageReservation { return reserveContextStorage(gl, amount, 'accum-rgba8'); }
export function chargeAccumOrphan(gl: WebGLRenderingContext, amount: number): void { chargeContextOrphan(gl, amount, 'accum-rgba8'); }
export function validateAccumReservation(gl: WebGLRenderingContext, token: StorageReservation, amount: number): void { assertStorageDomain(gl, token, amount, 'accum-rgba8'); }
export function materializeAccumStorage(gl: WebGLRenderingContext, token: StorageReservation, amount: number): StorageLease { validateAccumReservation(gl, token, amount); return materializeContextStorage(gl, token, amount); }
export const releaseAccumReservation = releaseStorageReservation;
export const releaseAccumLease = releaseStorageLease;
export const isAccumLeaseCurrent = isStorageLeaseCurrent;
export function assertStorageDomain(gl: WebGLRenderingContext, token: StorageReservation, amount: number, domain: StorageDomain): void {
    validateStorageReservation(gl, token, amount);
    if (reservations.get(token)!.domain !== domain)
        throw new Error('Storage reservation domain mismatch');
}
