import { diagnosticSettleOpTag, type WatercolorSettleQueue } from '../../../../apps/web/src/engine/src/watercolor/WatercolorSettleQueue'
export type BatchSchedule = 'baseline' | 'front' | 'presentation' | 'front-presentation' | 'solver'
type Tag = ReturnType<typeof diagnosticSettleOpTag>
type TickRecord = { startedMs: number; endedMs: number; gapMs: number | null; nextBefore: number | null; nextAfter: number | null; nextTag: Tag; drawing: boolean; readyReason: string; index: number; continuation: boolean; elapsedMs: number; ops: Record<Tag, number>; syncCount: number; syncMs: number }
type QueueProbe = Pick<WatercolorSettleQueue, 'current' | 'advance'> & { tick(continuation?: boolean): void; ctx: { syncGpu?(): void; isDrawing(): boolean } }
const emptyOps = (): Record<Tag, number> => ({ contact: 0, front: 0, presentation: 0, barrier: 0 })
/** Own-instance instrumentation only. No global GL/rAF interception. */
export function captureQueue(queue: WatercolorSettleQueue, schedule: BatchSchedule) {
  const probe = queue as unknown as QueueProbe
  const ticks: TickRecord[] = [], outsideOps = emptyOps()
  let active: TickRecord | null = null, tickCount = 0, outsideSyncCount = 0, outsideSyncMs = 0
  const original = { tick: probe.tick, advance: probe.advance, sync: probe.ctx.syncGpu }
  queue.diagnosticSolverBatchEnabled = schedule === 'solver'
  queue.frontBatchEnabled = schedule === 'front' || schedule === 'front-presentation'
  queue.presentationBatchEnabled = schedule === 'presentation' || schedule === 'front-presentation'
  // Never enable contact or continuation diagnostics as a side effect.
  probe.advance = function () {
    const tag = diagnosticSettleOpTag(this.current?.ops[this.current.next])
    const counts = active?.ops ?? outsideOps; counts[tag]++
    return original.advance.call(this)
  }
  if (original.sync) probe.ctx.syncGpu = function () {
    const at = performance.now()
    try { return original.sync!.call(this) }
    finally { const ms = performance.now() - at; if (active) { active.syncCount++; active.syncMs += ms } else { outsideSyncCount++; outsideSyncMs += ms } }
  }
  probe.tick = function (continuation = false) {
    const previous = active, startedMs = performance.now(), job = this.current, nextBefore = job?.next ?? null, row: TickRecord = { startedMs, endedMs: startedMs, gapMs: ticks.length ? startedMs - ticks[ticks.length-1].startedMs : null, nextBefore, nextAfter: null, nextTag: diagnosticSettleOpTag(job?.ops[job.next]), drawing: this.ctx.isDrawing(), readyReason: 'entered', index: tickCount++, continuation, elapsedMs: 0, ops: emptyOps(), syncCount: 0, syncMs: 0 }
    active = row; const at = performance.now()
    try { return original.tick.call(this, continuation) }
    finally { row.endedMs = performance.now(); row.elapsedMs = row.endedMs - at; row.nextAfter = this.current === job ? this.current?.next ?? null : null; row.readyReason = Object.values(row.ops).some(n=>n>0) ? (this.current === job ? 'advanced-pending' : 'completed-or-owner-changed') : (row.drawing && row.gapMs !== null && row.gapMs > 20 ? 'drawing-late-no-advance' : 'no-advance'); if (ticks.length < 10000) ticks.push(row); active = previous }
  }
  return {
    snapshot() {
      const rows = ticks.map(row => ({ ...row, ops: { ...row.ops } }))
      return { schedule, tickCount, truncated: tickCount > rows.length, ticks: rows, outsideOps: { ...outsideOps }, outsideSyncCount, outsideSyncMs,
        flags: { diagnosticSolverBatch: queue.diagnosticSolverBatchEnabled, front: queue.frontBatchEnabled, presentation: queue.presentationBatchEnabled, contact: queue.contactBatchEnabled, continuation: queue.continuationTasksEnabled },
        limitations: ['tick elapsed is JS+sync wall time, not GPU timestamp', 'synchronous complete drains bypass advance and are not counted as tick ops', 'records stop at timed boundary before diagnostic readbacks and undo'] }
    },
    detach() { probe.tick = original.tick; probe.advance = original.advance; probe.ctx.syncGpu = original.sync },
  }
}
