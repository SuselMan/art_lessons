import { assertStorageDomain, chargeContextOrphan, isStorageLeaseCurrent, materializeContextStorage, releaseStorageLease, releaseStorageReservation, reserveContextStorage, type StorageDomain, type StorageLease, type StorageReservation } from '../buffers/ContextStorageOwner';
export interface OwnedBrushResource {
    readonly texture: WebGLTexture;
    readonly bytes: number;
}
export interface OwnedBrushBuffer {
    readonly buffer: WebGLBuffer;
    readonly bytes: number;
}
interface Part {
    readonly lease: StorageLease;
    readonly dispose: () => void;
}
interface Owned {
    readonly gl: WebGLRenderingContext;
    readonly parts: Part[];
    readonly auxiliary: ((lost: boolean) => void)[];
    state: 'unpublished' | 'adopted' | 'merged' | 'released';
}
const ownership = new WeakMap<object, Owned>();
function checked(resource: object): Owned { const owned = ownership.get(resource); if (!owned || owned.state !== 'unpublished')
    throw new Error('Invalid/unavailable owned brush resource'); return owned; }
function disposeOwned(resource: object, lost: boolean, unpublishedOnly: boolean): void {
    const owned = ownership.get(resource);
    if (!owned || owned.state === 'released' || owned.state === 'merged' || unpublishedOnly && owned.state === 'adopted')
        return;
    owned.state = 'released';
    ownership.delete(resource);
    let expired = lost || owned.parts.every(part => !isStorageLeaseCurrent(owned.gl, part.lease)), failed = false, primary: unknown;
    if (!expired)
        try {
            expired = owned.gl.isContextLost();
        }
        catch (error) {
            expired = true;
            failed = true;
            primary = error;
        }
    for (const part of owned.parts) {
        let deleted = false;
        try {
            if (!expired && isStorageLeaseCurrent(owned.gl, part.lease)) {
                part.dispose();
                deleted = true;
            }
        }
        catch (error) {
            if (!failed) {
                failed = true;
                primary = error;
            }
        }
        finally {
            releaseStorageLease(part.lease, deleted);
        }
    }
    for (const auxiliary of owned.auxiliary)
        try {
            auxiliary(expired);
        }
        catch (error) {
            if (!failed) {
                failed = true;
                primary = error;
            }
        }
    if (failed)
        throw primary;
}
export function releaseUnpublishedBrushResource(resource: OwnedBrushResource | OwnedBrushBuffer, lost = false): void { disposeOwned(resource, lost, true); }
/** Transfer existing owned parts into the single cache payload. No new charge. */
export function combineOwnedBrushResources(primary: OwnedBrushResource, companions: readonly (OwnedBrushBuffer | OwnedBrushResource)[], auxiliary?: (lost: boolean) => void): OwnedBrushResource {
    const records = [primary, ...companions].map(checked), owner = records[0];
    if (new Set([primary, ...companions]).size !== records.length || records.some(record => record.gl !== owner.gl || record.parts.some(part => !isStorageLeaseCurrent(record.gl, part.lease))))
        throw new Error('Foreign/expired/duplicate brush companion');
    const resource = Object.freeze({ texture: primary.texture, bytes: primary.bytes + companions.reduce((sum, item) => sum + item.bytes, 0) });
    for (const resource of [primary, ...companions])
        ownership.delete(resource);
    ownership.set(resource, { gl: owner.gl, parts: records.flatMap(record => record.parts), auxiliary: [...records.flatMap(record => record.auxiliary), ...auxiliary ? [auxiliary] : []], state: 'unpublished' });
    return resource;
}
function cold(gl: WebGLRenderingContext, stage: string): void { const error = gl.getError(); if (error !== gl.NO_ERROR)
    throw new Error(`Brush ${stage} GL error ${error}`); }
function allocatePart(gl: WebGLRenderingContext, bytes: number, domain: StorageDomain, create: () => object | null, dispose: (handle: object) => void, allocate: (handle: object, mark: (bytes: number) => void) => void, reservation?: StorageReservation): {
    handle: object;
    owned: Owned;
} {
    const ticket = reservation ?? reserveContextStorage(gl, bytes, domain);
    let handle: object | null = null, attempted = 0;
    try {
        assertStorageDomain(gl, ticket, bytes, domain);
        if (gl.isContextLost())
            throw new Error('Brush allocation context lost');
        cold(gl, 'preexisting');
        handle = create();
        if (!handle)
            throw new Error('Brush resource allocation failed');
        allocate(handle, amount => { if (!Number.isSafeInteger(amount) || amount < 0 || attempted + amount > bytes)
            throw new Error('Invalid brush storage manifest'); attempted += amount; });
        if (attempted !== bytes)
            throw new Error('Incomplete brush storage manifest');
        cold(gl, 'allocation');
        const lease = materializeContextStorage(gl, ticket, bytes);
        const allocated = handle;
        return { handle, owned: { gl, parts: [{ lease, dispose: () => dispose(allocated) }], auxiliary: [], state: 'unpublished' } };
    }
    catch (primary) {
        if (handle) {
            let lost = false, queryFailed = false, deleted = false;
            try {
                lost = gl.isContextLost();
            }
            catch {
                queryFailed = true;
            }
            if (!lost && !queryFailed)
                try {
                    dispose(handle);
                    deleted = true;
                }
                catch { /* retain primary */ }
            if (!lost && !deleted && attempted)
                chargeContextOrphan(gl, attempted, domain);
        }
        throw primary;
    }
    finally {
        if (!reservation)
            releaseStorageReservation(ticket);
    }
}
export function allocateOwnedBrushTexture(gl: WebGLRenderingContext, bytes: number, allocate: (texture: WebGLTexture, mark: (bytes: number) => void) => void, reservation?: StorageReservation): OwnedBrushResource {
    const result = allocatePart(gl, bytes, 'brush-texture-rgba-equivalent', () => gl.createTexture(), handle => gl.deleteTexture(handle), allocate, reservation);
    const resource = Object.freeze({ texture: result.handle as WebGLTexture, bytes });
    ownership.set(resource, result.owned);
    return resource;
}
export function allocateOwnedBrushBuffer(gl: WebGLRenderingContext, bytes: number, allocate: (buffer: WebGLBuffer, mark: (bytes: number) => void) => void, reservation?: StorageReservation): OwnedBrushBuffer {
    const result = allocatePart(gl, bytes, 'brush-buffer', () => gl.createBuffer(), handle => gl.deleteBuffer(handle), allocate, reservation);
    const resource = Object.freeze({ buffer: result.handle as WebGLBuffer, bytes });
    ownership.set(resource, result.owned);
    return resource;
}
/** Conservative cache charge, not physical GPU memory. The opaque identity
 * permits deduplication when several services share this cache. No GL handles. */
export interface BrushStorageCharge {
    readonly owner: object;
    readonly chargeBytes: number;
}
export function distinctBrushStorageChargeBytes(snapshots: readonly BrushStorageCharge[]): number {
    const owners = new Set<object>();
    let bytes = 0;
    for (const snapshot of snapshots) {
        if (owners.has(snapshot.owner))
            continue;
        owners.add(snapshot.owner);
        bytes += snapshot.chargeBytes;
    }
    return bytes;
}
/** Per-painter GPU residency, conservatively charged as RGBA including mips.
 * Active draw-group resources may exceed the target; evicting one of those
 * would invalidate a bound sampler or re-upload the same working set forever. */
export class BrushTextureCache {
    private readonly entries = new Map<string, {
        texture: WebGLTexture;
        bytes: number;
        owned: OwnedBrushResource;
    }>();
    private protectedKeys = new Set<string>();
    private readonly leases = new Map<symbol, readonly {
        key: string;
        bytes: number;
    }[]>();
    private readonly storageOwner = Object.freeze({});
    private usedBytes = 0;
    private readonly gl: WebGLRenderingContext;
    private readonly targetBytes: number;
    constructor(gl: WebGLRenderingContext, targetBytes = 16 * 1024 * 1024) { this.gl = gl; this.targetBytes = targetBytes; }
    get bytes(): number { return this.usedBytes; }
    /** Metadata only. Caller must exclude a lost context's invalidated storage. */
    storageChargeSnapshot(): BrushStorageCharge {
        return Object.freeze({ owner: this.storageOwner, chargeBytes: this.usedBytes });
    }
    get budgetBytes(): number { return this.targetBytes; }
    protect(keys: readonly string[]): void {
        this.protectedKeys = new Set(keys);
        this.trim();
    }
    /** Synchronous paint-batch pinning, admitted only within the unchanged byte
     * target. It prevents a partially resident animation's sequential scan from
     * evicting its own later frames. No gesture/lifetime residency is promised. */
    lease(resources: readonly {
        key: string;
        bytes: number;
    }[]): () => void {
        for (const item of resources)
            if (!Number.isSafeInteger(item.bytes) || item.bytes < 0)
                throw new RangeError('Invalid GPU brush resource bytes');
        const union = new Map<string, number>();
        for (const group of this.leases.values())
            for (const item of group)
                union.set(item.key, item.bytes);
        for (const item of resources)
            union.set(item.key, item.bytes);
        if ([...union.values()].reduce((sum, bytes) => sum + bytes, 0) > this.targetBytes)
            return () => { };
        const token = Symbol();
        this.leases.set(token, resources);
        // The previous draw group can still be bound here. The caller switches
        // it before loading; changing residency now could evict a live sampler.
        return () => { this.leases.delete(token); this.trim(); };
    }
    resourceBytes(key: string): number | undefined { return this.entries.get(key)?.bytes; }
    get(key: string): WebGLTexture | undefined {
        const entry = this.entries.get(key);
        // No GL query: stale context names remain owned until explicit clear, but
        // can never be returned as a live sampler after the context epoch changes.
        if (entry) {
            const record = ownership.get(entry.owned);
            if (!record || record.parts.some(part => !isStorageLeaseCurrent(this.gl, part.lease)))
                return undefined;
            this.entries.delete(key);
            this.entries.set(key, entry);
        }
        return entry?.texture;
    }
    putOwned(key: string, resource: OwnedBrushResource): void {
        const owned = checked(resource);
        if (owned.gl !== this.gl || owned.parts.some(part => !isStorageLeaseCurrent(this.gl, part.lease)) || this.gl.isContextLost())
            throw new Error('Foreign/expired brush allocation');
        if (!this.protectedKeys.has(key))
            throw new Error('Resolve a protected brush group before uploading');
        if (this.entries.has(key))
            throw new Error('Brush texture cache entry already exists');
        owned.state = 'adopted';
        this.entries.set(key, { texture: resource.texture, bytes: resource.bytes, owned: resource });
        this.usedBytes += resource.bytes;
        this.trim();
    }
    /** Explicit owner teardown; never an implicit render-time eviction policy. */
    discard(key: string, lost = false): void {
        const entry = this.entries.get(key);
        if (!entry)
            return;
        this.entries.delete(key);
        this.usedBytes -= entry.bytes;
        this.protectedKeys.delete(key);
        disposeOwned(entry.owned, lost, false);
    }
    clear(lost = false): void {
        const entries = [...this.entries.values()];
        this.entries.clear();
        this.protectedKeys.clear();
        this.leases.clear();
        this.usedBytes = 0;
        let failed = false, primary: unknown;
        for (const entry of entries)
            try {
                disposeOwned(entry.owned, lost, false);
            }
            catch (error) {
                if (!failed) {
                    failed = true;
                    primary = error;
                }
            }
        if (failed)
            throw primary;
    }
    private trim(): void {
        let protectedBytes = 0;
        for (const [key, entry] of this.entries)
            if (this.protectedKeys.has(key))
                protectedBytes += entry.bytes;
        const limit = Math.max(this.targetBytes, protectedBytes);
        let protectedKeys = this.protectedKeys;
        if (this.leases.size) {
            protectedKeys = new Set(this.protectedKeys);
            for (const group of this.leases.values())
                for (const item of group)
                    protectedKeys.add(item.key);
            let unionBytes = 0;
            for (const [key, entry] of this.entries)
                if (protectedKeys.has(key))
                    unionBytes += entry.bytes;
            // An unplanned/oversized nested draw takes precedence over optional batch
            // pins. Never enlarge the old max(target,current draw working set) bound.
            if (unionBytes > limit) {
                this.leases.clear();
                protectedKeys = this.protectedKeys;
            }
        }
        let failed = false, primary: unknown;
        for (const [key, entry] of this.entries) {
            if (this.usedBytes <= limit)
                break;
            if (protectedKeys.has(key))
                continue;
            this.entries.delete(key);
            this.usedBytes -= entry.bytes;
            try {
                disposeOwned(entry.owned, false, false);
            }
            catch (error) {
                if (!failed) {
                    failed = true;
                    primary = error;
                }
            }
        }
        if (failed)
            throw primary;
    }
}
/** Upload does not bind an FBO or leave a different sampler/packing state.
 * Resolve the entire protected group before the caller binds it for drawing. */
export function brushTextureUploadBytes(gl: WebGLRenderingContext, levels: readonly Uint8Array[], format: number, wrapMode: number, discrete = false, plane?: {
    width: number;
    height: number;
}): number {
    return uploadManifest(gl, levels, format, wrapMode, discrete, plane).reduce((sum, level) => sum + level.bytes, 0);
}
function uploadManifest(gl: WebGLRenderingContext, levels: readonly Uint8Array[], format: number, wrapMode: number, discrete: boolean, plane?: {
    width: number;
    height: number;
}) {
    if (typeof format !== 'number' || format !== gl.RGBA && format !== gl.LUMINANCE_ALPHA && format !== gl.LUMINANCE && format !== gl.ALPHA)
        throw new Error('Unsupported brush texture format');
    if(typeof wrapMode!=='number'||wrapMode!==gl.CLAMP_TO_EDGE&&wrapMode!==gl.REPEAT&&wrapMode!==gl.MIRRORED_REPEAT)throw new Error('Unsupported brush texture wrap mode');
    if(typeof discrete!=='boolean')throw new Error('Invalid brush texture sampling mode');
    const selected = discrete ? levels.slice(0, 1) : levels, channels = format === gl.RGBA ? 4 : format === gl.LUMINANCE_ALPHA ? 2 : 1;
    if (!selected.length)
        throw new Error('Empty brush texture levels');
    const manifest=selected.map((pixels, level) => {
        const size = Math.sqrt(pixels.length / channels), width = plane?.width ?? size, height = plane?.height ?? size;
        if (!(pixels instanceof Uint8Array) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(width * height * 4) || pixels.length !== width * height * channels || plane && (levels.length !== 1 || level !== 0 || wrapMode !== gl.CLAMP_TO_EDGE))
            throw new Error('Invalid brush texture plane dimensions');
        return { pixels, width, height, level, bytes: width * height * 4 };
    });
    if(!plane){
        const side=manifest[0].width,pot=(side&(side-1))===0;
        if(discrete){if(!pot&&wrapMode!==gl.CLAMP_TO_EDGE)throw new Error('NPOT brush texture requires CLAMP_TO_EDGE')}
        else{
            if(!pot)throw new Error('Mipmapped brush texture requires POT dimensions');
            let expected=side;
            for(let index=0;index<manifest.length;index++){
                const item=manifest[index];
                if(item.width!==expected||item.height!==expected||expected===1&&index!==manifest.length-1)throw new Error('Invalid complete brush mip chain');
                expected=Math.max(1,expected/2);
            }
            if(manifest[manifest.length-1].width!==1)throw new Error('Incomplete brush mip chain');
        }
    }
    return manifest;
}
/** Existing sampler/unpack contract, now with explicit unpublished ownership. */
export function uploadBrushTexture(gl: WebGLRenderingContext, levels: readonly Uint8Array[], format: number, wrapMode: number, discrete = false, plane?: {
    width: number;
    height: number;
}, reservation?: StorageReservation): OwnedBrushResource {
    const manifest = uploadManifest(gl, levels, format, wrapMode, discrete, plane), bytes = manifest.reduce((sum, item) => sum + item.bytes, 0);
    const ticket = reservation ?? reserveContextStorage(gl, bytes, 'brush-texture-rgba-equivalent');
    let resource: OwnedBrushResource | undefined, restore: (() => void) | undefined, failed = false, primary: unknown;
    const attempt = (run: () => void) => { try {
        run();
    }
    catch (error) {
        if (!failed) {
            failed = true;
            primary = error;
        }
    } };
    try {
        assertStorageDomain(gl, ticket, bytes, 'brush-texture-rgba-equivalent');
        const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number, previous = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null, unpack = gl.getParameter(gl.UNPACK_ALIGNMENT) as number;
        restore = () => { let error: unknown, bad = false; for (const run of [() => gl.activeTexture(active), () => gl.bindTexture(gl.TEXTURE_2D, previous), () => gl.pixelStorei(gl.UNPACK_ALIGNMENT, unpack)])
            try {
                run();
            }
            catch (e) {
                if (!bad) {
                    bad = true;
                    error = e;
                }
            } if (bad)
            throw error; };
        resource = allocateOwnedBrushTexture(gl, bytes, (texture, mark) => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            for (const level of manifest) {
                mark(level.bytes);
                gl.texImage2D(gl.TEXTURE_2D, level.level, format, level.width, level.height, 0, format, gl.UNSIGNED_BYTE, level.pixels);
                cold(gl, 'texture allocation');
            }
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, plane ? gl.LINEAR : discrete ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, discrete ? gl.NEAREST : gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
        }, ticket);
    }
    catch (error) {
        failed = true;
        primary = error;
    }
    finally {
        if (restore)
            attempt(restore);
        if (!reservation)
            attempt(() => releaseStorageReservation(ticket));
        if (failed && resource)
            attempt(() => releaseUnpublishedBrushResource(resource!));
    }
    if (failed)
        throw primary;
    return resource!;
}
/** Real painter bridge: failed adoption cannot lose unpublished ownership or mask
 * its primary error with a later texture/buffer cleanup exception. */
export function publishOwnedBrushResource(cache: BrushTextureCache, key: string, resource: OwnedBrushResource): void {
    let failed = false, primary: unknown;
    try {
        cache.putOwned(key, resource);
    }
    catch (error) {
        failed = true;
        primary = error;
    }
    try {
        releaseUnpublishedBrushResource(resource);
    }
    catch (error) {
        if (!failed) {
            failed = true;
            primary = error;
        }
    }
    if (failed)
        throw primary;
}
