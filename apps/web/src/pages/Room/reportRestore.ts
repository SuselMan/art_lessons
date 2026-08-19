import * as Sentry from '@sentry/react'
import type { SnapshotRestoreAudit } from '../../engine/src/snapshotAudit'
import { buildRestoreReport, reportProblems, restoreReportTitle, type RestoreReport } from './restoreReport'
import type { SnapshotRestoreOutcome } from './snapshotRestore'

// (#474) The Sentry side of restore reporting — everything that decides *what*
// happened lives in restoreReport.ts, which is pure; this only decides what to
// do about it.
//
// Why any of this exists: production room 2xKybCLI opened showing one partial
// layer out of two, and Sentry had nothing for that session. Nothing was
// thrown. WebGL does not throw when it runs out of memory, and the restore path
// asked no questions, so a lost lesson and a clean join produced identical
// telemetry. The rule this file encodes is that a restore must now say what it
// did, every time, whether or not anything went wrong.

/** Breadcrumbs are capped by the SDK anyway, but a room join has exactly one
 *  restore, so this stays one crumb per join rather than a stream. */
const BREADCRUMB_CATEGORY = 'snapshot.restore'

/** Compact per-layer line for the breadcrumb — the full table goes in the
 *  context of an actual event, a crumb only has to be readable next to whatever
 *  error it is attached to. */
function crumbLine(layer: RestoreReport['layers'][number]): string {
  const mark = layer.problem ? `!${layer.problem}` : layer.live ? 'ok' : 'dead'
  return `${layer.layerId}@${layer.seq} ${layer.withContentAfter}/${layer.tilesIn} ${mark}`
}

/** Records what a restore did, and raises an event when what it did differs
 *  from what it set out to do.
 *
 *  Always leaves a breadcrumb, including on success. That is the half that pays
 *  for itself on failures this code did not anticipate: an unrelated exception
 *  ten seconds into a lesson now arrives carrying how the room was built, which
 *  is the question we ended up asking of every content-loss report so far and
 *  could never answer.
 *
 *  Returns the report so a caller can act on the verdict — today nobody does,
 *  and the restore keeps its existing behaviour on every path. Making the
 *  failure *visible* and making it *recoverable* are separate changes, and
 *  doing them together would mean shipping a recovery whose trigger has never
 *  fired in the wild. */
export function reportSnapshotRestore(
  roomId: string,
  outcome: SnapshotRestoreOutcome,
  audit: readonly SnapshotRestoreAudit[],
  gpu: RestoreReport['gpu'],
): RestoreReport | null {
  const report = buildRestoreReport(roomId, outcome, audit, gpu)
  if (!report) return null

  Sentry.addBreadcrumb({
    category: BREADCRUMB_CATEGORY,
    level: report.verdict === 'ok' ? 'info' : 'error',
    message: `restore ${report.verdict} (${report.status})`,
    data: {
      roomId,
      snapshotSeq: report.snapshotSeq,
      layers: report.layers.map(crumbLine).join(' | '),
      deadLayers: report.deadLayers,
      gpu: report.gpu.renderer,
    },
  })

  if (report.verdict === 'ok') return report

  // Grouped by failure mode, never by room: the varying parts (room id, seqs,
  // byte counts) are context. Without this every occurrence would open its own
  // issue and the second one would look like a different bug.
  Sentry.captureMessage(restoreReportTitle(report), {
    level: 'error',
    fingerprint: ['snapshot-restore', report.verdict, report.stage ?? '', ...reportProblems(report)],
    tags: {
      restore_verdict: report.verdict,
      restore_stage: report.stage ?? 'none',
      restore_oom: String(report.outOfMemory),
      gpu_renderer: report.gpu.renderer ?? 'unknown',
    },
    contexts: {
      snapshot_restore: {
        roomId: report.roomId,
        status: report.status,
        stage: report.stage,
        appliedBeforeFailure: report.appliedBeforeFailure,
        snapshotSeq: report.snapshotSeq,
        deadLayers: report.deadLayers,
        deadBytes: report.deadBytes,
        outOfMemory: report.outOfMemory,
        maxTextureSize: report.gpu.maxTextureSize,
        contextLost: report.gpu.contextLost,
        // One row per layer, as a string table: Sentry renders nested arrays of
        // objects as an unreadable blob, and this is the thing an on-call read
        // has to scan first.
        layers: report.layers.map(crumbLine).join('\n'),
      },
    },
  })
  return report
}
