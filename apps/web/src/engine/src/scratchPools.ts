// (#494) The engine's scratch-buffer pools, out of PencilEngine — the second
// seam of its decomposition. #494 counts five pools; the marker ribbon's has
// been its own class (RibbonScratchPool) since #385. The other four lived as
// four fields with hand-written copies of the same three rules — acquire,
// free on teardown, forget on context loss — and _handleContextRestored had
// to know each one by name to drop it correctly. Two shapes cover all four:
//
//  - a *slot*: exactly one buffer, reused while the size it is asked for
//    stays the same (the stroke preview and the live tip, both canvas-sized);
//  - a *free list*: many buffers alive at once, handed out by exact size and
//    returned when done (transform's per-tile bake, smudge's patches).
//
// Both take the buffer's constructor from the caller, so what a buffer *is* —
// its filtering, its GL context — stays the engine's business, and these can
// be tested without WebGL.

/** What a pool needs to know about a buffer. AccumulationBuffer satisfies it. */
export interface Poolable {
  readonly width: number
  readonly height: number
  destroy(): void
}

/** (#155) One buffer, kept alive across uses and reallocated only when the
 *  size asked for changes (the canvas size, which changes on an infinite
 *  room's resizeCanvas). Fixes a real stall: _onStart used to
 *  `new AccumulationBuffer(...)` a fresh _tipBuf/_previewBuf on *every*
 *  single stroke — a full GL texture + framebuffer allocation, capped off
 *  by AccumulationBuffer's own checkFramebufferStatus call (a known
 *  GPU-sync point on some drivers) — then destroy it again at stroke end.
 *  Harmless for a bounded room (buffer size = the room's fixed page size),
 *  but for an infinite room this is sized to the DPR-scaled *viewport*
 *  (see #154) — multi-megapixel on a real tablet — so every single
 *  pointerdown paid a real allocation + sync stall. Measured on-device via
 *  Chrome's own Interaction-to-Next-Paint breakdown: ~1s presentation
 *  delay on a `pointerdown`, with JS-side processing under 20ms — exactly
 *  a GPU-side stall the engine's own JS-timing stats (StrokeDebugStats)
 *  can't see, since they only time the per-move paint path, not stroke
 *  start. Fastest to notice writing short strokes quickly (many
 *  pointerdowns in a row), which is exactly what surfaced this.
 *
 *  Reusing the same GL object across strokes (only reallocating on an
 *  actual size change) turns that into a no-op after the first stroke.
 *  The pool field stays alive across strokes; the *active* _tipBuf/
 *  _previewBuf reference is still nulled at stroke end (see _onEnd) so
 *  _display()'s `if (this._tipBuf)` blend-skip when idle is unaffected —
 *  only the underlying GL object's lifetime changed, not the preview's own
 *  visibility semantics. */
export class ScratchSlot<B extends Poolable> {
  private held: B | null = null
  private readonly make: (width: number, height: number) => B

  constructor(make: (width: number, height: number) => B) {
    this.make = make
  }

  acquire(width: number, height: number): B {
    const existing = this.held
    if (existing && existing.width === width && existing.height === height) return existing
    existing?.destroy()
    const fresh = this.make(width, height)
    this.held = fresh
    return fresh
  }

  /** Frees the buffer — the engine is being torn down. */
  destroy(): void {
    this.held?.destroy()
    this.held = null
  }

  /** Drops the handle without touching the driver — the context was lost and
   *  took the object with it, so there is nothing left to free. */
  forget(): void {
    this.held = null
  }
}

/** (#155, #14) A size-keyed free list: many buffers alive at once, each handed
 *  out by exact size, idle between uses rather than reallocated. A room's tile
 *  grid never changes shape after construction, so in practice this settles
 *  into a pool of uniformly-sized buffers after first use. */
export class ScratchFreeList<B extends Poolable> {
  private free: B[] = []
  private readonly make: (width: number, height: number) => B

  constructor(make: (width: number, height: number) => B) {
    this.make = make
  }

  acquire(width: number, height: number): B {
    const idx = this.free.findIndex(b => b.width === width && b.height === height)
    if (idx !== -1) return this.free.splice(idx, 1)[0]
    return this.make(width, height)
  }

  release(buf: B): void {
    this.free.push(buf)
  }

  /** How many buffers are idle in the list. */
  idleCount(): number {
    return this.free.length
  }

  destroy(): void {
    for (const b of this.free) b.destroy()
    this.free = []
  }

  /** Dropped, not released: after a context loss the handles are dead, and
   *  putting them back would hand the next caller a buffer to paint through. */
  forget(): void {
    this.free = []
  }
}
