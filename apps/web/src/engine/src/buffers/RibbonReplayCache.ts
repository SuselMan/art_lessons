import type { Dab, StrokeOperation } from '@grafetto/shared'
import { AccumulationBuffer } from './AccumulationBuffer'
import type { ILayerBuffer } from './ILayerBuffer'
import type { RibbonProfile } from '../dabs/ribbonProfile'
import type { RibbonScratchPool } from './RibbonScratchPool'
import { RibbonStrokeScratch, type SpilledScratch } from './RibbonStrokeScratch'

export interface ReplayRibbonChunk {
  strokeId: string
  washStrokeId?: string
  target: ILayerBuffer
  scratch: RibbonStrokeScratch
  lastDab: Dab
  usedAt?: number
}

export interface RibbonReplayCacheContext {
  readonly ribbonScratchPool: () => RibbonScratchPool
  readonly destroyed: () => boolean
  readonly contextLost: () => boolean
  readonly inJobStep: () => boolean
  readonly gpuBudget: () => number
  readonly settlingScratch: () => RibbonStrokeScratch | undefined
  completeSettle(): void
  finishedChunk(): [string, ReplayRibbonChunk] | undefined
  rebuildLostWash(target: ILayerBuffer): void
  scheduleBudgetCheck(): void
  washGpuBytes(): number
}


/** (#468) How many ribbon gestures/washes the replay side keeps open at once.
 *
 *  Four, because each holds three pooled buffers per tile it touches, and
 *  because the thing it has to survive is other people painting between two
 *  strokes of one wash. Past that the oldest goes back to being a seam. */
const REPLAY_RIBBON_CHUNK_SLOTS = 4

/** #702: compact GPU states retain the former spill storage cap, and also
 *  count towards the device GPU budget. No cache or memory limit is raised. */
const SPILLED_WASHES_MAX_BYTES = 128 * 1024 * 1024

/** Owns replay gesture/wash scratch, LRU ordering and compact GPU parking.
 * Rendering, rebuild jobs, settle and device budget policy stay in the engine. */
export class RibbonReplayCache {
  private readonly ctx: RibbonReplayCacheContext
  constructor(ctx: RibbonReplayCacheContext) { this.ctx = ctx }

  /** (#536, §17.57) Who painted each replay-cache key - see _retireWashesOf. */
  authors = new Map<string, string>()

  /** (#702) Resting washes parked in compact GPU buffers. Their bytes are
   *  included in the same pool/device budget as active scratch. The next
   *  operation restores zero padding and continues the exact stored state.
   *  Keyed as the cache is; `target` is the layer buffer it mirrors. */
  spilled = new Map<string, {
    target: ILayerBuffer; userId: string | undefined; washStrokeId?: string; lastDab: Dab; spill: SpilledScratch
  }>()

  /** (§17.68) Open washes whose state could be neither kept nor spilled. Their
   *  next operation cannot be painted as everyone else paints it - so it
   *  rebuilds the layer instead, which replays the wash from its start. */
  lost = new Map<string, ILayerBuffer>()

  /** (§17.70) The spill in progress, a buffer per step, and the washes the
   *  cache's slots are waiting to see spilled after it. */
  spillJob: { work: Generator<void, SpilledScratch | null, void>; key: string; scratch: RibbonStrokeScratch; usedAt: number; timer: ReturnType<typeof setTimeout> | 0 } | null = null

  spillPumpTimer: ReturnType<typeof setTimeout> | 0 = 0

  chunks = new Map<string, {
    /** The grouping key: a wash id where the stroke has one, its gesture id
    *  otherwise (#468 v7). */
    strokeId: string
    /** Which *gesture* the last chunk belonged to, so a wash can tell one of
    *  its strokes ending from a gesture's chunk boundary. */
    washStrokeId?: string
    target: ILayerBuffer
    scratch: RibbonStrokeScratch
    lastDab: Dab
    /** (§17.68) performance.now() of its last operation - see _enforceGpuBudget. */
    usedAt?: number
  }>()


  /** The scratch this replayed operation should paint through, given the
   *  gesture it belongs to — see _replayRibbonChunk. Returns null for an
   *  operation with no gesture id (a stroke recorded before strokeId existed),
   *  which then falls back to a throwaway scratch, exactly as before. */
  /** (#536, §17.57) A participant's stroke closes every wash and gesture of
   *  theirs but its own: a wash is only ever joined by its author's NEXT
   *  stroke (the author's single open `_wash`), and a gesture's chunks are
   *  that author's consecutive operations. So the cache entries of their
   *  earlier washes can never be read again, and they go now instead of when
   *  the LRU gets to them - four whole-sheet washes held that way were most
   *  of the 600 MB the iPad died at (multitest, CJoiem15). A fact of the log
   *  order, the same live and on every replay, so what is painted does not
   *  change - only an open wash is no longer evicted to make room for them. */
  retireWashesOf(op: StrokeOperation): void {
    const key = op.washId ?? op.strokeId
    for (const [k, chunk] of this.chunks) {
      if (k === key || this.authors.get(k) !== op.userId) continue
      if (this.ctx.settlingScratch() === chunk.scratch) this.ctx.completeSettle()
      chunk.scratch.destroy()
      this.chunks.delete(k)
      this.authors.delete(k)
    }
    // (§17.68) ...and the ones spilled or lost: closed just the same.
    for (const [k, w] of this.spilled) {
      if (k !== key && w.userId === op.userId) { w.spill.dispose(); this.spilled.delete(k); this.lost.delete(k) }
    }
    for (const k of [...this.lost.keys()]) {
      if (k !== key && this.authors.get(k) === op.userId) { this.lost.delete(k); this.authors.delete(k) }
    }
    if (key) this.authors.set(key, op.userId)
  }


  replayChunkScratch(
    target: ILayerBuffer, strokeId: string | undefined, washId: string | undefined,
    dabs: Dab[], profile: RibbonProfile,
  ): { scratch: RibbonStrokeScratch; prevDab?: Dab } | null {
    // (#468 v7) A wash groups more strongly than a gesture: several strokes
    // share one accumulation, so the key is the wash where there is one and the
    // gesture otherwise. Grouping by the recorded id rather than by anything
    // measured here is what keeps replay a pure function of the log — the live
    // client already decided, using wall-clock timing replay must never see.
    const key = washId ?? strokeId
    if (!key || !dabs.length) return null
    const cached = this.chunks.get(key)
    if (cached && cached.target === target) {
      // `prevDab` bridges the ribbon across a *gesture's* chunks. Across two
      // strokes of one wash there is nothing to bridge — the brush was lifted —
      // so the band builder must not stitch them into one swept figure.
      const sameGesture = cached.washStrokeId === strokeId
      const prevDab = washId && !sameGesture ? undefined : cached.lastDab
      cached.lastDab = dabs[dabs.length - 1]
      cached.washStrokeId = strokeId
      // Only when a *new* stroke of the wash starts. This read the flag it had
      // just overwritten, so it fired on every operation — including the chunks
      // one long gesture is split into, which live never does. The brush was
      // getting recharged mid-stroke on replay and not while drawing, so a long
      // enough stroke came back different after a reload.
      if (washId && !sameGesture) cached.scratch.beginStroke()
      // Re-inserted so the map's own order is least-recently-used: the eviction
      // below takes the front, and a wash still being painted into must not be
      // the one thrown away.
      this.chunks.delete(key)
      this.chunks.set(key, cached)
      cached.usedAt = performance.now()
      return { scratch: cached.scratch, prevDab }
    }
    // A stale entry under the same key but a *different* layer buffer is not a
    // hit — the scratch mirrors the tiles of one target and nothing else.
    if (cached && this.ctx.settlingScratch() === cached.scratch) this.ctx.completeSettle() // (§17.52)
    cached?.scratch.destroy()
    this.chunks.delete(key)
    // #702: an open wash this client parked on the GPU, continued as a hit.
    const spilled = this.spilled.get(key)
    if (spilled && spilled.target !== target) { spilled.spill.dispose(); this.spilled.delete(key) }
    if (spilled && spilled.target === target) {
      this.spilled.delete(key)
      const back = RibbonStrokeScratch.unspill(this.ctx.ribbonScratchPool(), spilled.spill, target)
      if (back) {
        this.chunks.set(key, { strokeId: key, washStrokeId: spilled.washStrokeId, target, scratch: back, lastDab: spilled.lastDab })
        if (spilled.userId) this.authors.set(key, spilled.userId)
        this.trimChunkCache()
        return this.replayChunkScratch(target, strokeId, washId, dabs, profile)
      }
      this.lost.set(key, target)
    }
    if (this.lost.get(key) === target) {
      this.lost.delete(key)
      this.ctx.rebuildLostWash(target)
    }
    const scratch = new RibbonStrokeScratch(this.ctx.ribbonScratchPool(), profile.ink, profile.normalizeDeposit)
    scratch.beginStroke()
    this.chunks.set(key, {
      strokeId: key, washStrokeId: strokeId, target, scratch, lastDab: dabs[dabs.length - 1], usedAt: performance.now(),
    })
    this.trimChunkCache()
    this.ctx.scheduleBudgetCheck()
    return { scratch }
  }


  /** (§17.68) The cache back to REPLAY_RIBBON_CHUNK_SLOTS, least recently used
   *  first - spilled, not destroyed: a fifth participant's wash used to push
   *  out an open one, whose next stroke then started over in a fresh scratch
   *  on this client only. */
  trimChunkCache(): void {
    // #702: park resting washes in slices. The cache may temporarily
    // exceed its slot count while copies are queued.
    if (this.chunks.size > REPLAY_RIBBON_CHUNK_SLOTS && !this.ctx.inJobStep() && typeof setTimeout === 'function') {
      this.pumpSpills()
      return
    }
    while (this.chunks.size > REPLAY_RIBBON_CHUNK_SLOTS) {
      if (this.ctx.inJobStep()) {
        // (#701) A sliced rebuild already knows which gestures its remaining
        // journal continues. Reading a finished one back only to evict it can
        // block a frame for seconds. Keep the existing lost-wash fallback for
        // any continuation that arrives later, outside this known history.
        const finished = this.ctx.finishedChunk()
        if (finished) {
          const [key, chunk] = finished
          if (this.ctx.settlingScratch() === chunk.scratch) this.ctx.completeSettle()
          this.chunks.delete(key)
          this.lost.set(key, chunk.target)
          chunk.scratch.destroy()
          continue
        }
      }
      this.evictChunk(this.chunks.keys().next().value as string, true)
    }
  }


  /** (#702) Removes cache entry `key` from active scratch. `keep`: the wash may still
   *  be joined, so it is spilled - or, where it cannot be (mid-gesture, past
   *  the memory cap), marked lost. */
  evictChunk(key: string, keep: boolean): void {
    const c = this.chunks.get(key)
    if (!c) return
    if (this.ctx.settlingScratch() === c.scratch) this.ctx.completeSettle() // (§17.52)
    if (this.spillJob?.key === key) this.cancelSpillJob()
    this.chunks.delete(key)
    if (keep) {
      const origins = new Map<AccumulationBuffer, { originX: number; originY: number }>()
      for (const t of c.target.allResident()) origins.set(t.buffer, { originX: t.originX, originY: t.originY })
      const spill = c.scratch.spill(tile => origins.get(tile) ?? null)
      if (spill) {
        this.spilled.get(key)?.spill.dispose()
        this.spilled.set(key, { target: c.target, userId: this.authors.get(key), washStrokeId: c.washStrokeId, lastDab: c.lastDab, spill })
      } else {
        this.lost.set(key, c.target)
      }
    }
    c.scratch.destroy()
    this.trimSpilled()
  }


  /** #702: cancelling a park returns its partial GPU copies to the pool. */
  cancelSpillJob(): void {
    const job = this.spillJob
    if (!job) return
    this.spillJob = null
    if (job.timer) clearTimeout(job.timer)
    job.work.return(null)
  }


  /** GPU copies over frames; no readPixels or GPU fence in this job. */
  startSpill(key: string): void {
    const c = this.chunks.get(key)
    if (!c) return
    const origins = new Map<AccumulationBuffer, { originX: number; originY: number }>()
    for (const t of c.target.allResident()) origins.set(t.buffer, { originX: t.originX, originY: t.originY })
    const work = c.scratch.spillWork(tile => origins.get(tile) ?? null)
    const job = { work, key, scratch: c.scratch, usedAt: c.usedAt ?? 0, timer: 0 as ReturnType<typeof setTimeout> | 0 }
    this.spillJob = job
    const step = (): void => {
      job.timer = 0
      if (this.spillJob !== job) return
      const now = this.chunks.get(key)
      if (this.ctx.destroyed() || this.ctx.contextLost() || now !== c || (c.usedAt ?? 0) !== job.usedAt
        || c.scratch.diffusePending || this.ctx.settlingScratch() === c.scratch) { work.return(null); this.spillJob = null; this.pumpSpillsLater(); return }
      const t0 = performance.now()
      let r = work.next()
      while (!r.done && performance.now() - t0 < 4) r = work.next()
      if (!r.done) { job.timer = setTimeout(step, 16); return }
      this.spillJob = null
      this.chunks.delete(key)
      if (r.value) {
        this.spilled.get(key)?.spill.dispose()
        this.spilled.set(key, { target: c.target, userId: this.authors.get(key), washStrokeId: c.washStrokeId, lastDab: c.lastDab, spill: r.value })
      } else {
        this.lost.set(key, c.target)
      }
      c.scratch.destroy()
      this.trimSpilled()
      if (this.ctx.gpuBudget() !== Infinity) this.ctx.ribbonScratchPool().trimFree()
      this.ctx.scheduleBudgetCheck()
      this.pumpSpillsLater()
    }
    job.timer = setTimeout(step, 0)
  }


  /** (§17.70) While the cache is over its slots and nothing is being
   *  spilled, spills the least recently used wash that is at rest (the map's
   *  order is its use order). One busy just now is tried again a little later. */
  pumpSpills(): void {
    if (this.ctx.destroyed() || this.spillJob || this.ctx.inJobStep()) return
    if (this.chunks.size <= REPLAY_RIBBON_CHUNK_SLOTS) return
    for (const [key, c] of this.chunks) {
      if (c.scratch.diffusePending || this.ctx.settlingScratch() === c.scratch) continue
      this.startSpill(key)
      return
    }
    this.pumpSpillsLater()
  }


  pumpSpillsLater(): void {
    if (this.spillPumpTimer || this.ctx.destroyed()) return
    this.spillPumpTimer = setTimeout(() => { this.spillPumpTimer = 0; this.pumpSpills() }, 100)
  }


  /** #702: parked GPU storage is bounded by the existing 128 MiB cap AND
   *  the device budget. Past either, the existing journal-rebuild fallback
   *  replaces the oldest parked state. */
  trimSpilled(): void {
    // Release idle allocations before sacrificing any recoverable wash.
    if (this.ctx.washGpuBytes() > this.ctx.gpuBudget()) this.ctx.ribbonScratchPool().trimFree()
    let bytes = 0
    for (const w of this.spilled.values()) bytes += w.spill.bytes
    for (const [k, w] of this.spilled) {
      if (bytes <= SPILLED_WASHES_MAX_BYTES && this.ctx.washGpuBytes() <= this.ctx.gpuBudget()) break
      bytes -= w.spill.bytes
      w.spill.dispose()
      this.ctx.ribbonScratchPool().trimFree()
      this.spilled.delete(k)
      this.lost.set(k, w.target)
    }
  }


  /** (§17.68) Spilled and lost washes of `target` are about a buffer that is
   *  going away. */
  forgetWashesOf(target: ILayerBuffer): void {
    for (const [k, w] of this.spilled) if (w.target === target) { w.spill.dispose(); this.spilled.delete(k) }
    for (const [k, t] of this.lost) if (t === target) this.lost.delete(k)
  }
}
