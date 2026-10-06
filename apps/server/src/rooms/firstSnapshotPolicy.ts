import { SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'

/** First per-layer coverage at the actual current watermark, never a rounded
 * boundary. Structural-only uploads still follow the regular cadence.
 * This policy does not replace saveSnapshot's structural/content validation. */
export function permitsSnapshotWatermark(
  seq: number,
  latestSeq: number,
  coveredSeqByLayer: ReadonlyMap<string, number>,
  requestedLayerIds: readonly string[],
): boolean {
  if (!Number.isSafeInteger(seq) || seq <= 0) return false
  // Preserve the existing periodic-upload contract. The new current-head
  // restriction belongs only to the first nonboundary coverage path.
  if (seq % SNAPSHOT_SEQ_INTERVAL === 0) return true
  if (seq !== latestSeq || requestedLayerIds.length === 0) return false
  // Concurrent duplicate uploads at this same first watermark are legitimate.
  // A partial first upload must not prevent another uncovered layer from
  // earning its own coverage; structure alone says nothing about pixels.
  return requestedLayerIds.every(id => {
    const covered = coveredSeqByLayer.get(id)
    return covered === undefined || covered === seq
  })
}
