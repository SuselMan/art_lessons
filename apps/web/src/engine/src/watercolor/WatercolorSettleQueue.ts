import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'

const contactPulses = new WeakSet<() => void>()
const frontSteps = new WeakSet<() => void>()
const presentationTokens = new WeakMap<() => void, object>()
/** Only adjacent resumptions of this captured presentation may share a tick. */
export function presentationStepOp(op: () => void, token: object): () => void {
  presentationTokens.set(op, token); return op
}
/** Only conservative paired contact exchanges may share a post-lift tick. */
export function contactPulseOp(op: () => void): () => void { contactPulses.add(op); return op }
/** Existing front/carry chunks retain their internal pass order and state. */
export function frontStepOp(op: () => void): () => void { frontSteps.add(op); return op }
/** Preserve scheduling classes when a continuation gains an ownership wrapper. */
export function inheritSettleOpTags(source: () => void, wrapped: () => void): void {
  if (contactPulses.has(source)) contactPulses.add(wrapped)
  if (frontSteps.has(source)) frontSteps.add(wrapped)
  const token = presentationTokens.get(source)
  if (token) presentationTokens.set(wrapped, token)
}

/** Drawing can pause before its recipient has any tiles; ownership, rather
 * than tile count, defines that coroutine's lifetime. Solver jobs keep the
 * existing scratch.live rule. */
export interface WatercolorSettleLifecycle {
  isAlive(): boolean
  abort(): void
  /** Captured owner/gesture request; never reads the next gesture identity. */
  isExpedited?(): boolean
}

export interface WatercolorSettleJob {
  scratch: RibbonStrokeScratch
  ops: Array<() => void>
  next: number
  complete: () => void
  raf: number
  lifecycle?: WatercolorSettleLifecycle
}

export interface WatercolorSettleQueueContext {
  beforeStart(): void
  perf(): { settleStart: number; settleOps: number; settleMs: number }
  isDrawing(): boolean
  backlogSize(): number
  canonicalBacklogSize?(): number
  backlogMax(): number
  syncGpu?(): void
  noteActivity(now: number): void
  scheduleFieldRelease(): void
}

/** One settle at a time: synchronous drain or adaptive animation-frame steps.
 * The first entry captures the deposit immediately; the rest may yield. */
export class WatercolorSettleQueue {
  private readonly ctx: WatercolorSettleQueueContext
  constructor(ctx: WatercolorSettleQueueContext) { this.ctx = ctx }
  get current(): WatercolorSettleJob | null { return this._settle }
  /** Diagnostic opt-in: intermediate presentation cannot reach a frame during a synchronous drain. */
  suppressDrainPreview = false
  /** Opt-in gate for copies whose downstream reveal callback rejects an active stroke. */
  suppressActivePreview = false
  private _drainDepth = 0
  get allowProgressPreview(): boolean { return !this.suppressDrainPreview || this._drainDepth === 0 }

  /** (#536, §17.22) The author's pen-up settle in flight: the diffusion's
   *  GPU steps, run a few per animation frame under the reveal instead of
   *  all at once — 89 ms in one go for a 400 px brush on a desktop GPU, a
   *  visible hitch at every pen-up on a tablet. One at a time, by design:
   *  the steps run over the shared _diffuseField, so anything that needs the
   *  field (another settle, a replay's) drains this one first. */
  private _settle: WatercolorSettleJob | null = null

  /** Candidate remains opt-in until physical-device budget and parity gates pass. */
  contactBatchEnabled = false

  /** Diagnostic cap variants share the same wall budget and lifecycle guards. */
  contactBatchMax: 4 | 8 | 16 = 4

  /** Separate diagnostic: never enables contact batching or crosses uploads. */
  frontBatchEnabled = false

  /** Diagnostic only: snapshot/capture and other generators remain barriers. */
  presentationBatchEnabled = false

  /** Experimental post-lift tasks; preserves mandatory animation-frame yields. */
  continuationTasksEnabled = false
  private continuationCount = 0
  private continuationCancel: (() => void) | null = null

  private cancelContinuation(): void {
    this.continuationCancel?.()
    this.continuationCancel = null
    this.continuationCount = 0
  }

  private scheduleContinuation(s: WatercolorSettleJob): boolean {
    if (!this.continuationTasksEnabled || this.ctx.isDrawing()
      || !(s.lifecycle?.isExpedited?.() || (this.ctx.canonicalBacklogSize?.() ?? 0) > 0)
      || this.continuationCount >= 2 || this.continuationCancel) return false
    this.continuationCount++
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    this.continuationCancel = () => { controller.abort(); if (timer !== undefined) clearTimeout(timer) }
    const run = (): void => {
      this.continuationCancel = null
      if (controller.signal.aborted || this._settle !== s) return
      // Input may arrive between tasks: defer to the regular drawing policy.
      if (this.ctx.isDrawing() || !this.isAlive(s)) { this.scheduleTick(); return }
      this.tick(true)
    }
    const scheduler = (globalThis as typeof globalThis & {
      scheduler?: { postTask(callback: () => void, options: { signal: AbortSignal; priority: 'user-visible' }): Promise<unknown> }
    }).scheduler
    if (scheduler) void scheduler.postTask(run, { signal: controller.signal, priority: 'user-visible' }).catch(() => {
      if (!controller.signal.aborted && this._settle === s) { this.continuationCancel = null; this.scheduleTick() }
    })
    else timer = setTimeout(run, 0)
    return true
  }

  private _settleTickAt = 0

  private _settleSkipped = 0

  /** (#536, §17.22) How many of a settle's GPU steps run per animation frame
   *  when it is spread out. Two: a step is one full-field pass, ~8 ms for a
   *  400 px brush on a desktop GPU, and the whole list is 15–27 entries, so
   *  the settle lands within the first quarter of the reveal.
   *  (§17.46) One: on the tablet two entries a frame made four to six frames
   *  of 50-67 ms after every big stroke's pen-up, one made none, for a settle
   *  of 1.07 s instead of 0.76 s - still inside the reveal. */
  private static readonly WET_SETTLE_OPS_PER_TICK = 1

  /** Begins running `ops` a few per frame, then `complete`. Drains a settle
   *  already in flight first: both use the one _diffuseField. */
  start(scratch: RibbonStrokeScratch, ops: Array<() => void>, complete: () => void, lifecycle?: WatercolorSettleLifecycle): void {
    if (this._settle) this.complete()
    this.ctx.beforeStart()
    this._settle = { scratch, ops, next: 0, complete, raf: 0, lifecycle }
    // (§17.44) The stitch - the settle's first entry, copies only - runs NOW:
    // it captures the deposit and its settled base as they stand at this
    // boundary, before the next chunk's batches rebuild them. The dear
    // passes are what gets spread over the frames.
    if (ops.length) { ops[0](); this._settle.next = 1 }
    this.ctx.perf().settleStart = performance.now()
    this.ctx.perf().settleOps = ops.length
    this.scheduleTick()
  }

  private scheduleTick(): void {
    const s = this._settle
    if (!s || s.raf) return
    s.raf = requestAnimationFrame(() => {
      this.continuationCount = 0
      s.raf = 0
      this.tick()
    })
  }

  private tick(continuation = false): void {
    const s = this._settle
    if (!s) return
    // The wash was torn down under it (undo, a new wash): nothing to land.
    if (!this.isAlive(s)) { this.cancel(); return }
    // (§17.44) One entry a frame while the pen is still down (a chunk's
    // settle under a running gesture): the frame also has the brush's own
    // batches to draw, and two entries made the tablet's P95 frame 110-150 ms.
    // (§17.46) ...and only in a frame that follows an on-time one: a wet-on-
    // wet chunk's entries (the puddle's coarse diffusion, the re-mobilisation)
    // on top of the brush's own work dropped a frame in eight on the tablet.
    // Never more than three frames without one, or the settle stalls.
    const nowT = performance.now()
    const late = this._settleTickAt > 0 && nowT - this._settleTickAt > 20
    // Continuations must not disguise a missed animation-frame deadline.
    if (!continuation) this._settleTickAt = nowT
    if (this.ctx.isDrawing() && late && this._settleSkipped < 3) {
      this._settleSkipped++
      this.scheduleTick()
      return
    }
    this._settleSkipped = 0
    // (§17.58) ...and more a frame while peers' operations wait behind it and
    // nobody is drawing here: one a frame is 0.5-1 s an operation on the
    // iPad, and with three others painting their marks arrived up to ten
    // seconds late.
    // Only after an on-time frame, the same gate as the pen's: a late one means
    // the device is already behind.
    if (this.continuationTasksEnabled && !late && !this.ctx.isDrawing()
      && (s.lifecycle?.isExpedited?.() || (this.ctx.canonicalBacklogSize?.() ?? 0) > 0) && this.ctx.syncGpu) {
      const at = performance.now()
      for (let n = 0; n < 4 && this._settle === s; n++) {
        this.advance()
        this.ctx.syncGpu()
        if (this._settle !== s || !this.isAlive(s) || this.ctx.isDrawing() || performance.now() - at >= 4) break
      }
      if (this._settle === s && !this.scheduleContinuation(s)) this.scheduleTick()
      return
    }
    const perTick = this.ctx.isDrawing() || late ? 1
      : Math.min(this.ctx.backlogMax(), WatercolorSettleQueue.WET_SETTLE_OPS_PER_TICK + this.ctx.backlogSize())
    for (let k = 0; k < perTick && this._settle === s; k++) {
      const batchable = this.contactBatchEnabled && contactPulses.has(s.ops[s.next]) ? contactPulses
        : this.frontBatchEnabled && frontSteps.has(s.ops[s.next]) ? frontSteps : null
      const presentationToken = this.presentationBatchEnabled ? presentationTokens.get(s.ops[s.next]) : undefined
      const sameBatch = (op: () => void): boolean => batchable ? batchable.has(op)
        : !!presentationToken && presentationTokens.get(op) === presentationToken
      if ((batchable || presentationToken) && !late && !this.ctx.isDrawing() && this.ctx.syncGpu) {
        const batchAt = performance.now()
        const cap = batchable === contactPulses && (this.contactBatchMax === 8 || this.contactBatchMax === 16)
          ? this.contactBatchMax : 4
        for (let n = 0; n < cap && this._settle === s && sameBatch(s.ops[s.next]); n++) {
          this.advance()
          // Submission time alone does not bound queued GPU work. Synchronize
          // every pulse, so a slow device overruns by only one existing step.
          this.ctx.syncGpu()
          if (performance.now() - batchAt >= 4 || this.ctx.isDrawing()) break
        }
        break // Per-tick backlog acceleration must not multiply this budget.
      }
      this.advance()
    }
    if (this._settle === s) this.scheduleTick()
  }

  /** Runs the next entry of the settle in flight; lands it after the last. */
  advance(): void {
    const s = this._settle
    if (!s) return
    this.ctx.noteActivity(performance.now()) // (§17.68)
    if (!this.isAlive(s)) { this.cancel(); return }
    if (s.next < s.ops.length) s.ops[s.next++]()
    if (s.next < s.ops.length) return
    this._settle = null
    this.cancelContinuation()
    if (s.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.raf)
    s.complete()
    this.ctx.perf().settleMs = performance.now() - this.ctx.perf().settleStart
    this.ctx.scheduleFieldRelease()
  }

  /** Runs whatever is left of the settle in flight, now. Called before
   *  anything that would paint into the wash or reuse the field: the
   *  copy-back at the end writes the deposit as it was when the settle began,
   *  so paint laid meanwhile would be lost. */
  complete(): void {
    const s = this._settle
    if (!s) return
    this._drainDepth++
    try {
      this._settle = null
      this.cancelContinuation()
      if (s.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.raf)
      if (!this.isAlive(s)) { s.lifecycle?.abort(); return }
      for (; s.next < s.ops.length; s.next++) s.ops[s.next]()
      s.complete()
      this.ctx.perf().settleMs = performance.now() - this.ctx.perf().settleStart
      this.ctx.scheduleFieldRelease()
      // (§17.72) A peer's operation drawn over frames lands by finishing its
      // stroke, which starts that stroke's own settle: "nothing in flight" is
      // what every caller of this is after.
      if (this._settle) this.complete()
    } finally { this._drainDepth-- }
  }

  private isAlive(s: WatercolorSettleJob): boolean {
    return s.lifecycle ? s.lifecycle.isAlive() : s.scratch.live
  }

  /** Drops the settle in flight without landing it — the field is gone. */
  cancel(): void {
    const s = this._settle
    if (!s) return
    this._settle = null
    this.cancelContinuation()
    if (s.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.raf)
    s.lifecycle?.abort()
  }
}
