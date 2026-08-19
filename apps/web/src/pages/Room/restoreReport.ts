import type { LayerState } from '@grafetto/shared'
import { GL_OUT_OF_MEMORY, type SnapshotRestoreAudit } from '../../engine/src/snapshotAudit'
import type { SnapshotRestoreOutcome } from './snapshotRestore'

// (#474) Turns a finished restore into a verdict and a report.
//
// The point of this file is that it compares two independently-sourced
// accounts of the same event. The *plan* comes off the network — which layers
// the server says it has pixels for, at which seq. The *audit* comes out of the
// engine afterward — how many tiles each layer actually holds and what
// `gl.getError()` said. A bug where the GPU silently drops an upload is
// invisible to either account alone and obvious the moment they disagree.
//
// Deliberately pure: no Sentry, no engine, no fetch. The interesting inputs are
// the ones that only occur on somebody else's tablet at join time, so the logic
// that judges them has to be reachable from a unit test.

/** How the restore is judged. `failed` means the restore did not complete;
 *  `incomplete` is the worse one — it completed and *reported success* while
 *  the pixels say otherwise, which is the shape production incident 2xKybCLI
 *  took (one partial layer, one missing, no error anywhere). */
export type RestoreVerdict = 'ok' | 'incomplete' | 'failed'

/** Per-layer line of the report. Numbers only — no pixels, no names, nothing a
 *  privacy policy has to account for (#323). */
export interface RestoreReportLayer {
  layerId: string
  /** Whether the room's own structure still lists this layer. A `false` here is
   *  ordinary — the snapshot index lists every layer ever baked, including
   *  deleted ones — and is exactly the waste the server-side index filter
   *  removes. */
  live: boolean
  seq: number
  bytes: number
  tilesIn: number
  tilesUploaded: number
  residentAfter: number
  withContentAfter: number
  glError: number
  /** Why this layer failed its check, absent when it passed. */
  problem?: 'not-applied' | 'no-buffer' | 'gl-error' | 'blank-after-restore' | 'tiles-missing'
}

export interface RestoreReport {
  verdict: RestoreVerdict
  roomId: string
  status: SnapshotRestoreOutcome['status']
  /** Only on a failure: where it stopped, and how many layers it had already
   *  pushed into the engine before it did. */
  stage?: 'index' | 'blobs' | 'apply'
  appliedBeforeFailure?: number
  snapshotSeq?: number
  layers: RestoreReportLayer[]
  /** Blobs downloaded for layers the room no longer has, and their compressed
   *  weight. Never affects the verdict — it is not a fault, it is the cost of
   *  an index that does not filter itself, and having the number is what makes
   *  that cost arguable instead of assumed. */
  deadLayers: number
  deadBytes: number
  gpu: { renderer: string | null; maxTextureSize: number; contextLost: boolean }
  /** True when any layer reported GL_OUT_OF_MEMORY — the specific hypothesis
   *  this whole mechanism was built to confirm or kill. */
  outOfMemory: boolean
}

/** The engine's audit, keyed for lookup, keeping the *last* record per layer.
 *  A layer can legitimately be applied twice across a session (a reconnect
 *  re-restores), and the newest is the one the current screen reflects. */
function byLayer(audit: readonly SnapshotRestoreAudit[]): Map<string, SnapshotRestoreAudit> {
  const map = new Map<string, SnapshotRestoreAudit>()
  for (const entry of audit) map.set(entry.layerId, entry)
  return map
}

/** What went wrong for one live layer, or undefined if nothing did.
 *
 *  Order matters: the checks run cheapest-explanation-first, so a layer that
 *  hit GL_OUT_OF_MEMORY *and* came back blank is reported as the GL error,
 *  which is the cause, rather than as blankness, which is the consequence. */
function problemFor(
  audit: SnapshotRestoreAudit | undefined,
): RestoreReportLayer['problem'] | undefined {
  if (!audit) return 'not-applied'
  if (!audit.known) return 'no-buffer'
  if (audit.glError !== 0) return 'gl-error'
  // A layer that carried no tiles is not expected to hold any afterward — an
  // uncovered layer arrives as operations instead, which is ordinary (#369).
  if (audit.tilesIn > 0 && audit.withContentAfter === 0) return 'blank-after-restore'
  if (audit.residentAfter < audit.tilesUploaded) return 'tiles-missing'
  return undefined
}

/** Builds the report. `layerState` is the structure the restore itself carried
 *  — null when it never got far enough to have one, in which case no layer can
 *  be judged live and the verdict rests on the outcome alone. */
export function buildRestoreReport(
  roomId: string,
  outcome: SnapshotRestoreOutcome,
  audit: readonly SnapshotRestoreAudit[],
  gpu: RestoreReport['gpu'],
): RestoreReport | null {
  // Nothing was ever baked for this room: there is no restore to judge, and a
  // report saying so on every join of every new room would be pure noise.
  if (outcome.status === 'none') return null

  const layerState: LayerState | null = outcome.status === 'restored' ? outcome.head.layerState : null
  const audits = byLayer(audit)
  const live = (layerId: string): boolean =>
    layerState !== null && Object.prototype.hasOwnProperty.call(layerState.items, layerId)

  let deadLayers = 0
  let deadBytes = 0
  let anyProblem = false
  let outOfMemory = false

  const layers: RestoreReportLayer[] = outcome.plan.map(entry => {
    const seen = audits.get(entry.layerId)
    const isLive = live(entry.layerId)
    if (!isLive) {
      deadLayers++
      deadBytes += entry.bytes
    }
    if (seen?.glError === GL_OUT_OF_MEMORY) outOfMemory = true
    // A layer the room no longer lists is *supposed* to be dropped, so it is
    // described but never judged — judging it would make every room with a
    // deleted layer report itself broken.
    const problem = isLive ? problemFor(seen) : undefined
    if (problem) anyProblem = true
    return {
      layerId: entry.layerId,
      live: isLive,
      seq: entry.seq,
      bytes: entry.bytes,
      tilesIn: seen?.tilesIn ?? 0,
      tilesUploaded: seen?.tilesUploaded ?? 0,
      residentAfter: seen?.residentAfter ?? 0,
      withContentAfter: seen?.withContentAfter ?? 0,
      glError: seen?.glError ?? 0,
      ...(problem ? { problem } : {}),
    }
  })

  const verdict: RestoreVerdict =
    outcome.status === 'failed' ? 'failed' : anyProblem ? 'incomplete' : 'ok'

  return {
    verdict,
    roomId,
    status: outcome.status,
    ...(outcome.status === 'failed'
      ? { stage: outcome.stage, appliedBeforeFailure: outcome.appliedLayerIds.length }
      : {}),
    ...(outcome.status === 'restored' ? { snapshotSeq: outcome.head.seq } : {}),
    layers,
    deadLayers,
    deadBytes,
    gpu,
    outOfMemory,
  }
}

/** The distinct problems this report names, sorted. Sorted because it feeds a
 *  Sentry fingerprint, and a fingerprint that depends on layer order would
 *  split one failure mode across as many issues as a room has layer
 *  permutations. */
export function reportProblems(report: RestoreReport): string[] {
  const seen = new Set<string>()
  for (const layer of report.layers) if (layer.problem) seen.add(layer.problem)
  return [...seen].sort()
}

/** One line summarising the report, used as the Sentry issue title.
 *
 *  Written by hand rather than left to Sentry's own grouping: a captureMessage
 *  whose text carries a room id and byte counts becomes a new issue per join,
 *  which is how a real signal drowns itself. This keeps the varying parts out
 *  of the title and in the context, so every occurrence of one failure mode
 *  lands on one issue. */
export function restoreReportTitle(report: RestoreReport): string {
  if (report.verdict === 'failed') {
    return report.appliedBeforeFailure
      ? `Snapshot restore failed at ${report.stage} after applying layers`
      : `Snapshot restore failed at ${report.stage}`
  }
  return `Snapshot restore incomplete: ${reportProblems(report).join(', ')}`
}
