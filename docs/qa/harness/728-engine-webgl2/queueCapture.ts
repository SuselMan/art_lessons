import { diagnosticSettleOpTag, type WatercolorSettleQueue } from '../../../../apps/web/src/engine/src/watercolor/WatercolorSettleQueue'
export type BatchSchedule = 'baseline' | 'front' | 'presentation' | 'front-presentation'
type Tag = ReturnType<typeof diagnosticSettleOpTag>
type TickRecord = { index: number; continuation: boolean; elapsedMs: number; ops: Record<Tag, number>; syncCount: number; syncMs: number }
type QueueProbe = Pick<WatercolorSettleQueue, 'current' | 'advance'> & { tick(continuation?: boolean): void; ctx: { syncGpu?(): void } }
const emptyOps = (): Record<Tag, number> => ({ contact: 0, front: 0, presentation: 0, barrier: 0 })
/** Own-instance instrumentation only. No global GL/rAF interception. */
export function captureQueue(queue: WatercolorSettleQueue, schedule: BatchSchedule) {
  const probe = queue as unknown as QueueProbe
  const ticks: TickRecord[] = [], outsideOps = emptyOps()
  let active: TickRecord | null = null, tickCount = 0, outsideSyncCount = 0, outsideSyncMs = 0
  const original = { tick: probe.tick, advance: probe.advance, sync: probe.ctx.syncGpu }
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
    const previous = active, row: TickRecord = { index: tickCount++, continuation, elapsedMs: 0, ops: emptyOps(), syncCount: 0, syncMs: 0 }
    active = row; const at = performance.now()
    try { return original.tick.call(this, continuation) }
    finally { row.elapsedMs = performance.now() - at; if (ticks.length < 10000) ticks.push(row); active = previous }
  }
  return {
    snapshot() {
      const rows = ticks.map(row => ({ ...row, ops: { ...row.ops } }))
      return { schedule, tickCount, truncated: tickCount > rows.length, ticks: rows, outsideOps: { ...outsideOps }, outsideSyncCount, outsideSyncMs,
        flags: { front: queue.frontBatchEnabled, presentation: queue.presentationBatchEnabled, contact: queue.contactBatchEnabled, continuation: queue.continuationTasksEnabled },
        limitations: ['tick elapsed is JS+sync wall time, not GPU timestamp', 'synchronous complete drains bypass advance and are not counted as tick ops', 'records stop at timed boundary before diagnostic readbacks and undo'] }
    },
    detach() { probe.tick = original.tick; probe.advance = original.advance; probe.ctx.syncGpu = original.sync },
  }
}
