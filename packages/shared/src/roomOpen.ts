/** Diagnostic input only: no canvas content, names or email addresses. */
export type RoomOpenStage =
  /** Join request -> room state received (including the operation tail). */
  | 'join'
  /** Paper bytes, decompression, catch reconstruction and GPU upload. */
  | 'paper'
  /** Snapshot index and layer pixel blobs. */
  | 'snapshot'
  /** Operation tail replayed over the restored pixels. */
  | 'replay'
export interface RoomOpenFacts {
  /** Number of operations in the tail to replay. */
  tailOperations?: number
  latestSeq?: number
  snapshotSeq?: number | null
  restoredFromSnapshot?: boolean
  layers?: number
}
export interface RoomOpenReport {
  /** stalled is an intermediate observation, never a completed duration. */
  outcome: 'ready' | 'stalled'
  totalMs: number
  stages: Partial<Record<RoomOpenStage, number>>
  reached: RoomOpenStage
  facts: RoomOpenFacts
}
export interface RoomOpenMeasurement {
  attemptId: string
  roomId: string
  report: RoomOpenReport
  appVersion: string
  deviceType: 'desktop' | 'tablet'
  /** True if the page was hidden at any point during this attempt. */
  wasHidden: boolean
}

const STAGES: readonly RoomOpenStage[] = ['join', 'paper', 'snapshot', 'replay']
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function duration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 24 * 60 * 60 * 1000
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function stage(value: unknown): value is RoomOpenStage {
  return value === 'join' || value === 'paper' || value === 'snapshot' || value === 'replay'
}

/** Whitelists and bounds untrusted telemetry; extra fields are never stored. */
export function parseRoomOpenMeasurement(value: unknown): RoomOpenMeasurement | null {
  if (!record(value) || typeof value.attemptId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.attemptId)
    || typeof value.roomId !== 'string' || !/^[\w-]{1,80}$/.test(value.roomId)
    || typeof value.appVersion !== 'string' || value.appVersion.length > 80
    || (value.deviceType !== 'desktop' && value.deviceType !== 'tablet') || typeof value.wasHidden !== 'boolean') return null
  const r = value.report
  if (!record(r) || (r.outcome !== 'ready' && r.outcome !== 'stalled') || !duration(r.totalMs)
    || !stage(r.reached) || !record(r.stages) || !record(r.facts)) return null
  const stages: RoomOpenReport['stages'] = {}
  for (const key of STAGES) {
    const ms = r.stages[key]
    if (ms === undefined) continue
    if (!duration(ms) || ms > r.totalMs) return null
    stages[key] = ms
  }
  if (stages[r.reached] === undefined || Math.abs(Object.values(stages).reduce((a, b) => a + b, 0) - r.totalMs) > STAGES.length) return null
  const facts: RoomOpenFacts = {}
  for (const key of ['tailOperations', 'latestSeq', 'layers'] as const) {
    const n = r.facts[key]
    if (n !== undefined) {
      if (!count(n)) return null
      facts[key] = n
    }
  }
  if (r.facts.snapshotSeq !== undefined) {
    if (r.facts.snapshotSeq !== null && !count(r.facts.snapshotSeq)) return null
    facts.snapshotSeq = r.facts.snapshotSeq
  }
  if (r.facts.restoredFromSnapshot !== undefined) {
    if (typeof r.facts.restoredFromSnapshot !== 'boolean') return null
    facts.restoredFromSnapshot = r.facts.restoredFromSnapshot
  }
  return { attemptId: value.attemptId, roomId: value.roomId, appVersion: value.appVersion,
    deviceType: value.deviceType, wasHidden: value.wasHidden,
    report: { outcome: r.outcome, totalMs: r.totalMs, reached: r.reached, stages, facts } }
}
