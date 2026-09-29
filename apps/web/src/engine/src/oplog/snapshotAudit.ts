// (#474) What one `restoreLayerFromSnapshot` call actually did, as opposed to
// what it was asked to do.
//
// This type exists because the two can differ *silently*. WebGL does not throw
// when it runs out of memory: `texImage2D` sets GL_OUT_OF_MEMORY, which only
// exists if somebody calls `gl.getError()`, and the tile is simply left blank.
// A restore that lost half its pixels that way returns normally, reports
// success to its caller, and produces no exception for Sentry to catch — which
// is exactly how production room 2xKybCLI came up showing one partial layer out
// of two with nothing anywhere to say so.
//
// So every restore now records what it saw, and the caller compares that record
// against the plan it started from. The comparison is the point: `tilesIn`
// comes from the downloaded snapshot, `residentAfter`/`withContentAfter` come
// from the engine's own buffers afterward, and they are gathered by two
// different routes on purpose. A single number agreeing with itself would prove
// nothing about a bug that consists of the GPU quietly dropping work.

/** One layer's restore, as observed rather than as intended. */
export interface SnapshotRestoreAudit {
  layerId: string
  /** False when the engine held no buffer for this id — `restoreLayerFromSnapshot`
   *  returns immediately, and the tiles are dropped on the floor. Ordinary for a
   *  layer deleted since its snapshot was baked (the index still lists it), which
   *  is precisely why it must be distinguishable from a layer that was supposed to
   *  receive pixels and didn't. */
  known: boolean
  /** Tiles the decoded snapshot carried. */
  tilesIn: number
  /** Tiles this call actually pushed at GL — differs from `tilesIn` when blank
   *  tiles are dropped from a re-sliced set (see restoreLayerFromSnapshot). */
  tilesUploaded: number
  /** Total pixel bytes handed over, for weighing a report against the room. */
  bytes: number
  /** `gl.getError()` after the uploads, `0` for NO_ERROR. The whole reason this
   *  interface exists: 0x0505 here is GL_OUT_OF_MEMORY, i.e. an unknown number
   *  of those `tilesUploaded` never landed. */
  glError: number
  /** Tiles the layer holds after the call. Below `tilesUploaded` means tiles
   *  were evicted or never created. */
  residentAfter: number
  /** Of those, how many track real content. Zero after a non-empty upload is
   *  the strongest single signal that this layer came back blank. */
  withContentAfter: number
}

/** GL_OUT_OF_MEMORY. Named because `0x0505` in a report tells nobody anything,
 *  and because it is the one error code this whole mechanism was built for. */
export const GL_OUT_OF_MEMORY = 0x0505
