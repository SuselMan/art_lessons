import { AccumulationBuffer } from './AccumulationBuffer'

// (#536, §17.44) 14, from 6: the half-resolution settle takes and gives back
// a snapshot pair and a temporary per tile of a big wash (six tiles on a
// sheet) around every chunk, and past six free the pool destroyed them and
// made them again - a texture, an FBO and a framebuffer-status check that
// stalls the tablet's GPU, 430 ms of a zigzag's CPU time.
const MARKER_SCRATCH_POOL_PER_SIZE = 24
/** (#536, §17.50) Ceiling on idle pooled scratch, all sizes. */
const SCRATCH_POOL_FREE_BYTES = 64 * 1024 * 1024

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
  /** (#536, §17.22) Bytes of every buffer this pool has created and not yet
   *  destroyed, and of those, the ones sitting free — for the perf readout. */
  private _allocatedBytes = 0
  private _freeBytes = 0

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
  }

  /** Live (handed out) and free bytes. */
  get bytes(): { live: number; free: number } {
    return { live: this._allocatedBytes - this._freeBytes, free: this._freeBytes }
  }

  acquire(width: number, height: number): AccumulationBuffer {
    const list = this._free.get(`${width}x${height}`)
    const reused = list?.pop()
    if (reused) { this._freeBytes -= width * height * 4; return reused }
    // 'nearest' matches what RibbonStrokeScratch has always asked for — see
    // its getOrCreate comment. The pool must never hand back a buffer built
    // with a different filter, which is why it is keyed by size alone and
    // used by this one caller.
    this._allocatedBytes += width * height * 4
    return new AccumulationBuffer(this.gl, width, height, 'nearest')
  }

  /** (§17.70) While set, released buffers are all kept: a rebuild on a
   *  low-memory device lets go of the rebuilt layer's old washes so that its
   *  own can be made from them, not from new textures. */
  holding = false

  /** (§17.70) Back to the usual ceilings once `holding` ends. */
  trimToCeiling(): void {
    for (const [key, list] of this._free) {
      while (list.length && (list.length > MARKER_SCRATCH_POOL_PER_SIZE || this._freeBytes > SCRATCH_POOL_FREE_BYTES)) {
        const b = list.pop()!
        const bytes = b.width * b.height * 4
        b.destroy()
        this._freeBytes -= bytes
        this._allocatedBytes -= bytes
      }
      if (!list.length) this._free.delete(key)
    }
  }

  release(buf: AccumulationBuffer): void {
    const key = `${buf.width}x${buf.height}`
    const bytes = buf.width * buf.height * 4
    const list = this._free.get(key)
    if (this.holding) {
      if (list) list.push(buf); else this._free.set(key, [buf])
      this._freeBytes += bytes
      return
    }
    if (!list && this._freeBytes + bytes > SCRATCH_POOL_FREE_BYTES) { buf.destroy(); this._allocatedBytes -= bytes; return }
    if (!list) { this._free.set(key, [buf]); this._freeBytes += bytes; return }
    // (#536, ADR 011 §17.50) ...and never more than SCRATCH_POOL_FREE_BYTES
    // held idle in all: on the iPad (Safari, 3 GB) 151 MB of idle buffers on
    // top of the live wash was enough for the tab to be killed and reloaded
    // at the next stroke.
    if (list.length >= MARKER_SCRATCH_POOL_PER_SIZE || this._freeBytes + bytes > SCRATCH_POOL_FREE_BYTES) { buf.destroy(); this._allocatedBytes -= bytes; return }
    list.push(buf)
    this._freeBytes += bytes
  }

  destroy(): void {
    for (const list of this._free.values()) for (const b of list) b.destroy()
    this._free.clear()
    this._allocatedBytes = 0
    this._freeBytes = 0
  }

  /** (#536, §17.57) Gives every idle buffer back to the driver. */
  trimFree(): void {
    for (const list of this._free.values()) for (const b of list) b.destroy()
    this._free.clear()
    this._allocatedBytes -= this._freeBytes
    this._freeBytes = 0
  }

  /** Context loss took every GL object with it — drop the handles without
   *  calling destroy() on them, same as every other pool in this file does. */
  forget(): void {
    this._free.clear()
    this._allocatedBytes = 0
    this._freeBytes = 0
  }
}

