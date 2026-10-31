import { isRasterPixelEncoding, type RasterPixelEncoding } from '@grafetto/shared'
import { AccumulationBuffer } from './AccumulationBuffer'
import { reserveAccumStorage, releaseAccumReservation, validateAccumReservation, type StorageReservation } from './ContextStorageOwner'

// (#536, §17.44) 14, from 6: the half-resolution settle takes and gives back
// a snapshot pair and a temporary per tile of a big wash (six tiles on a
// sheet) around every chunk, and past six free the pool destroyed them and
// made them again - a texture, an FBO and a framebuffer-status check that
// stalls the tablet's GPU, 430 ms of a zigzag's CPU time.
const MARKER_SCRATCH_POOL_PER_SIZE = 24
/** (#536, §17.50) Ceiling on idle pooled scratch, all sizes. */
const SCRATCH_POOL_FREE_BYTES = 64 * 1024 * 1024

export interface RibbonScratchRequest {
  readonly width: number
  readonly height: number
  readonly pixelEncoding?: RasterPixelEncoding
  readonly filter?: 'linear' | 'nearest'
}
/** Bounded ownership transaction in the existing pool, not a second pool. */
export interface RibbonScratchAcquisition {
  readonly length: number
  take(index: number): AccumulationBuffer
  close(): void
}

/** (#385) Free list for RibbonStrokeScratch's buffers, so a gesture ending and
 *  the next one starting reuses GL objects instead of deleting three and
 *  allocating three more.
 *
 *  Not a micro-optimisation — it is what makes a long room openable at all. The
 *  scratch is three buffers *the size of the tile it mirrors*, and a bounded
 *  room's "tile" is the whole canvas: on A2 that is 3 × 34.8 MB per marker
 *  gesture. Replaying a real 2001-operation room churned 166 such textures
 *  through the driver in one batch, and the 167th allocation failed with
 *  `Framebuffer incomplete` — not from volume (live texture memory peaked at
 *  281 MB, and 2.1 GB allocates fine from cold) but from the churn itself:
 *  deleted textures stay charged to the context until the GPU service side
 *  processes them, which it does not do in the middle of one synchronous
 *  replay. Forcing a gl.finish() after every marker stroke also made the room
 *  open, which is what identified churn rather than size as the cause; pooling
 *  removes the churn instead of waiting on it.
 *
 *  Every other scratch in this engine is already pooled for its own reasons
 *  (_previewBufPool, _tipBufPool, AreaOps' scratchPool, SmudgePainter's scratchPool) —
 *  the marker's was the one that was not.
 *
 *  Capped per size rather than unbounded: an infinite room's gesture can span
 *  several tiles at once, and holding every tile a session ever touched would
 *  trade this bug for a memory one. Over the cap, release really does delete.
 *  Six is two tiles' worth, which covers a bounded room (always exactly one
 *  tile) with room to spare. */
export class RibbonScratchPool {
  private _free = new Map<string, AccumulationBuffer[]>()
  private readonly gl: WebGLRenderingContext
  // Physical ownership, independent of the free-list indexing. Bytes are read
  // from the buffer because mip storage may grow after acquire().
  private readonly allocations = new Map<AccumulationBuffer, 'live' | 'free'>()
  private epoch = 0
  private lostEpoch = -1

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
  }

  /** Live (handed out) and free bytes. */
  get bytes(): { live: number; free: number } {
    let live = 0, free = 0
    for (const [buffer, state] of this.allocations) {
      if (state === 'live') live += buffer.storageByteLength
      else free += buffer.storageByteLength
    }
    return { live, free }
  }

  /** Metadata only: no recovery, GL queries or ownership transfer. Entries are
   * unique actual allocations; returned records/array cannot mutate the ledger. */
  gpuAllocationSnapshot(): ReadonlyArray<Readonly<{ buffer: AccumulationBuffer; state: 'live' | 'free'; bytes: number }>> {
    return Object.freeze([...this.allocations].map(([buffer, state]) =>
      Object.freeze({ buffer, state, bytes: buffer.storageByteLength })))
  }

  /** Claims idle matches before yielding and reserves ONLY missing physical
   * storage in the same context owner. Call close in finally; taken buffers
   * remain normal caller-owned pool borrows. No GL allocation during prepare. */
  prepareAcquisition(requests: readonly RibbonScratchRequest[]): RibbonScratchAcquisition {
    if (!Array.isArray(requests) || !requests.length || requests.length > 128)
      throw new RangeError('Invalid scratch acquisition count')
    const plan = Array.from(requests, request => {
      if (!request || !Number.isSafeInteger(request.width) || !Number.isSafeInteger(request.height)
        || request.width < 1 || request.height < 1 || request.width > 4096 || request.height > 4096)
        throw new RangeError('Invalid scratch acquisition size')
      const pixelEncoding = request.pixelEncoding === undefined ? 'premultiplied-rgba8' : request.pixelEncoding
      const filter = request.filter === undefined ? 'nearest' : request.filter
      if (!isRasterPixelEncoding(pixelEncoding) || filter !== 'linear' && filter !== 'nearest'
        || pixelEncoding === 'straight-rgba8' && filter !== 'nearest') throw new TypeError('Invalid scratch acquisition policy')
      return { width: request.width, height: request.height, pixelEncoding, filter,
        key: `${pixelEncoding}:${filter}:${request.width}x${request.height}` }
    })
    const epoch = this.epoch, held: Array<AccumulationBuffer | undefined> = [], taken = plan.map(() => false)
    let missing = 0, ticket: StorageReservation | undefined, closed = false
    const close = () => {
      if (closed) return
      closed = true
      let failed = false, failure: unknown, contextCurrent = true
      if (ticket) try { validateAccumReservation(this.gl, ticket, 0) } catch { contextCurrent = false }
      for (let i = 0; i < held.length; i++) {
        const buffer = held[i]
        if (!buffer || taken[i]) continue
        held[i] = undefined
        try {
          if (this.epoch === epoch && contextCurrent) this.release(buffer)
          else if (this.lostEpoch <= epoch) { buffer.destroy(); this.allocations.delete(buffer) }
          // An actual lost-context epoch is forgotten by the context owner;
          // never issue GL deletion from a stale plan after pool.forget().
        } catch (error) { if (!failed) { failed = true; failure = error } }
      }
      try { if (ticket) releaseAccumReservation(ticket) }
      catch (error) { if (!failed) { failed = true; failure = error } }
      if (failed) throw failure
    }
    try {
      for (const request of plan) {
        const existing = this._free.get(request.key)?.pop()
        held.push(existing)
        if (existing) this.allocations.set(existing, 'live')
        else missing += request.width * request.height * 4
      }
      ticket = reserveAccumStorage(this.gl, missing)
    } catch (primary) {
      try { close() } catch (cleanup) { throw new AggregateError([primary, cleanup], 'Scratch admission and cleanup failed') }
      throw primary
    }
    return Object.freeze({ length: plan.length, close, take: (index: number) => {
      try {
        if (closed || this.epoch !== epoch || !Number.isInteger(index) || index < 0 || index >= plan.length || taken[index])
          throw new Error('Invalid or stale scratch acquisition')
        validateAccumReservation(this.gl, ticket!, 0)
        let buffer = held[index]
        if (!buffer) {
          const request = plan[index]
          buffer = new AccumulationBuffer(this.gl, request.width, request.height, request.filter, request.pixelEncoding, ticket)
          this.allocations.set(buffer, 'live')
        }
        taken[index] = true
        return buffer
      } catch (primary) {
        // Never retry an allocation against a ticket after an uncertain driver
        // failure: orphan storage must continue to consume the context budget.
        try { close() } catch (cleanup) { throw new AggregateError([primary, cleanup], 'Scratch acquisition and cleanup failed') }
        throw primary
      }
    } })
  }

  acquire(width: number, height: number, pixelEncoding: RasterPixelEncoding = 'premultiplied-rgba8', filter: 'linear' | 'nearest' = 'nearest'): AccumulationBuffer {
    if (filter !== 'linear' && filter !== 'nearest' || pixelEncoding === 'straight-rgba8' && filter !== 'nearest') throw new TypeError('Invalid pooled buffer sampling policy')
    const list = this._free.get(`${pixelEncoding}:${filter}:${width}x${height}`)
    const reused = list?.pop()
    if (reused) { this.allocations.set(reused, 'live'); return reused }
    // Existing paint scratch keeps its nearest default. Derived PM presentation
    // can request linear; neither policy may borrow the other's allocation.
    // Every encoding/filter still shares this pool's ONE byte/idle ceiling.
    const created = new AccumulationBuffer(this.gl, width, height, filter, pixelEncoding)
    this.allocations.set(created, 'live')
    return created
  }

  /** (§17.70) While set, released buffers are all kept: a rebuild on a
   *  low-memory device lets go of the rebuilt layer's old washes so that its
   *  own can be made from them, not from new textures. */
  holding = false

  /** (§17.70) Back to the usual ceilings once `holding` ends. */
  trimToCeiling(): void {
    let freeBytes = this.bytes.free
    const retired: AccumulationBuffer[] = []
    for (const [key, list] of this._free) {
      while (list.length && (list.length > MARKER_SCRATCH_POOL_PER_SIZE || freeBytes > SCRATCH_POOL_FREE_BYTES)) {
        const b = list.pop()!
        freeBytes -= b.storageByteLength
        this.allocations.delete(b)
        retired.push(b)
      }
      if (!list.length) this._free.delete(key)
    }
    this.retireBuffers(retired)
  }

  release(buf: AccumulationBuffer): void {
    if (this.allocations.get(buf) !== 'live') throw new Error('Unknown or already released scratch buffer')
    const key = `${buf.pixelEncoding}:${buf.samplingFilter}:${buf.width}x${buf.height}`
    const bytes = buf.storageByteLength
    const list = this._free.get(key)
    if (this.holding) {
      if (list) list.push(buf); else this._free.set(key, [buf])
      this.allocations.set(buf, 'free')
      return
    }
    if (!list && this.bytes.free + bytes > SCRATCH_POOL_FREE_BYTES) { this.allocations.delete(buf); buf.destroy(); return }
    if (!list) { this._free.set(key, [buf]); this.allocations.set(buf, 'free'); return }
    // (#536, ADR 011 §17.50) ...and never more than SCRATCH_POOL_FREE_BYTES
    // held idle in all: on the iPad (Safari, 3 GB) 151 MB of idle buffers on
    // top of the live wash was enough for the tab to be killed and reloaded
    // at the next stroke.
    if (list.length >= MARKER_SCRATCH_POOL_PER_SIZE || this.bytes.free + bytes > SCRATCH_POOL_FREE_BYTES) { this.allocations.delete(buf); buf.destroy(); return }
    list.push(buf)
    this.allocations.set(buf, 'free')
  }

  /** Destroys idle only, as before. Outstanding borrowers remain responsible
   * for their handles; late release is rejected after ownership is forgotten. */
  destroy(): void {
    this.epoch++
    const retired = [...this._free.values()].flat()
    this._free.clear()
    this.allocations.clear()
    this.retireBuffers(retired)
  }

  /** (#536, §17.57) Gives every idle buffer back to the driver. */
  trimFree(): void {
    const retired = [...this._free.values()].flat()
    this._free.clear()
    for (const buffer of retired) this.allocations.delete(buffer)
    this.retireBuffers(retired)
  }

  /** Ownership was already detached by the caller; no retry after failure. */
  private retireBuffers(buffers: readonly AccumulationBuffer[]): void {
    let failed = false, firstError: unknown
    for (const buffer of buffers) {
      try { buffer.destroy() } catch (error) { if (!failed) { failed = true; firstError = error } }
    }
    if (failed) throw firstError
  }

  /** Context loss took every GL object with it — drop the handles without
   *  calling destroy() on them, same as every other pool in this file does. */
  forget(): void {
    this.lostEpoch = ++this.epoch
    this._free.clear()
    this.allocations.clear()
  }
}

