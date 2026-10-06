import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'

export interface SmallSettleCost { draws: number; pixels: number }
export type SettleOperation = (() => void) & { smallCost?: () => SmallSettleCost | null }

/** An estimate for a known local pass; null keeps the one-entry boundary. */
export function smallSettleOperation(op: () => void, cost: () => SmallSettleCost | null): SettleOperation {
  return Object.assign(op, { smallCost: cost })
}

export interface WatercolorSettleJob {
  scratch: RibbonStrokeScratch
  ops: SettleOperation[]
  next: number
  complete: () => void
  raf: number
}

export interface WatercolorSettleQueueContext {
  beforeStart(): void
  perf(): { settleStart: number; settleOps: number; settleMs: number }
  isDrawing(): boolean
  backlogSize(): number
  backlogMax(): number
  noteActivity(now: number): void
  scheduleFieldRelease(): void
  syncGpu(): void
}

/** One settle at a time: synchronous drain or adaptive animation-frame steps.
 * The first entry captures the deposit immediately; the rest may yield. */
export class WatercolorSettleQueue {
  private readonly ctx: WatercolorSettleQueueContext
  constructor(ctx: WatercolorSettleQueueContext) { this.ctx = ctx }
  /** Isolated performance experiment, disabled in every normal engine. */
  idleBatch = false
  get current(): WatercolorSettleJob | null { return this._settle }

  /** (#536, §17.22) The author's pen-up settle in flight: the diffusion's
   *  GPU steps, run a few per animation frame under the reveal instead of
   *  all at once — 89 ms in one go for a 400 px brush on a desktop GPU, a
   *  visible hitch at every pen-up on a tablet. One at a time, by design:
   *  the steps run over the shared _diffuseField, so anything that needs the
   *  field (another settle, a replay's) drains this one first. */
  private _settle: WatercolorSettleJob | null = null

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
  start(scratch: RibbonStrokeScratch, ops: SettleOperation[], complete: () => void): void {
    if (this._settle) this.complete()
    this.ctx.beforeStart()
    this._settle = { scratch, ops, next: 0, complete, raf: 0 }
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
      s.raf = 0
      this.tick()
    })
  }

  private tick(): void {
    const s = this._settle
    if (!s) return
    // The wash was torn down under it (undo, a new wash): nothing to land.
    if (!s.scratch.live) { this._settle = null; return }
    // (§17.44) One entry a frame while the pen is still down (a chunk's
    // settle under a running gesture): the frame also has the brush's own
    // batches to draw, and two entries made the tablet's P95 frame 110-150 ms.
    // (§17.46) ...and only in a frame that follows an on-time one: a wet-on-
    // wet chunk's entries (the puddle's coarse diffusion, the re-mobilisation)
    // on top of the brush's own work dropped a frame in eight on the tablet.
    // Never more than three frames without one, or the settle stalls.
    const nowT = performance.now()
    const late = this._settleTickAt > 0 && nowT - this._settleTickAt > 20
    this._settleTickAt = nowT
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
    const perTick = this.ctx.isDrawing() || late ? 1
      : Math.min(this.ctx.backlogMax(), WatercolorSettleQueue.WET_SETTLE_OPS_PER_TICK + this.ctx.backlogSize())
    if (this.idleBatch && !this.ctx.isDrawing() && !late) this.advanceIdleBatch(s)
    else for (let k = 0; k < perTick && this._settle === s; k++) this.advance()
    if (this._settle === s) this.scheduleTick()
  }

  /** At most sixteen draw equivalents/two million pixels, then GPU time.
   * Unknown or presentation-bearing entries keep their own frame boundary. */
  private advanceIdleBatch(s: WatercolorSettleJob): void {
    let draws = 0, pixels = 0, count = 0
    const started = performance.now()
    while (this._settle === s && s.next < s.ops.length) {
      const cost = s.ops[s.next].smallCost?.()
      const known = cost && Number.isFinite(cost.draws) && Number.isFinite(cost.pixels)
        && cost.draws >= 1 && cost.pixels >= 0 && cost.draws <= 16 && cost.pixels <= (1 << 21)
      if (!known) {
        if (count === 0) { this.advance(); this.ctx.syncGpu() }
        break
      }
      if (draws + cost.draws > 16 || pixels + cost.pixels > (1 << 21)) break
      draws += cost.draws; pixels += cost.pixels; count++
      this.advance()
      // A single local operator is indivisible; timing after submission is
      // meaningless until its GPU work completes.
      this.ctx.syncGpu()
      if (performance.now() - started >= 12) break
    }
  }

  /** Runs the next entry of the settle in flight; lands it after the last. */
  advance(): void {
    const s = this._settle
    if (!s) return
    this.ctx.noteActivity(performance.now()) // (§17.68)
    if (!s.scratch.live) { this._settle = null; return }
    if (s.next < s.ops.length) s.ops[s.next++]()
    if (s.next < s.ops.length) return
    this._settle = null
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
    this._settle = null
    if (s.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.raf)
    if (!s.scratch.live) return
    for (; s.next < s.ops.length; s.next++) s.ops[s.next]()
    s.complete()
    this.ctx.perf().settleMs = performance.now() - this.ctx.perf().settleStart
    this.ctx.scheduleFieldRelease()
    // (§17.72) A peer's operation drawn over frames lands by finishing its
    // stroke, which starts that stroke's own settle: "nothing in flight" is
    // what every caller of this is after.
    if (this._settle) this.complete()
  }

  /** Drops the settle in flight without landing it — the field is gone. */
  cancel(): void {
    const s = this._settle
    if (!s) return
    this._settle = null
    if (s.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.raf)
  }
}
