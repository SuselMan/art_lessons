# Canonical frame executor: explicit straight-layer service

This unit connects existing decoded material frames and composition planning to
**actual `TiledLayerBuffer` storage**. It does not activate a room format, wire
channel, painter, authoring policy or replay hook. Both local and recorded
adapters must call the same `enqueue`/`advance` API with an already accepted
`CanonicalMaterialFrame`. Pointer input, `SourceStrokeAuthor`, mutable UI values
and RNG never enter the executor.

## Composition and resource ownership

- `sourcePrimaryComposition` is the single opacity/fence state owner. Its pure
  result is computed once per accepted frame. Splitting one draw across targets
  never updates opacity history again. The existing scalar-profile controls are
  passed to the already proved material/prepass/composite services unchanged.
- Only straight RGBA8 `TiledLayerBuffer` and matching epochs are accepted. The
  executor does not reinterpret a premultiplied texture or change an encoding.
  `bindCanonicalLayerTargets` supplies real owned texture/FBO identities and
  synchronous `retainTargets` lifetimes; no tile lifetime survives a yield.
- A turn stages at most eight commands. Every staged target is retained
  immediately, before resolving a later target can evict it. The existing GL
  batch captures the attribute/sampler union; its cooperative 4 ms test is
  checked after each complete command. Metadata planning/allocation and one
  command may overshoot this soft limit. There is no new asynchronous scheduler.
- Cursors retain coordinates, frame/draw/tile/subrectangle indices, never a
  borrowed prepass view or layer target across turns. Only a successful write
  advances the cursor. Partly completed commands are not retried.
- Prepared source-bank levels and prepass/composite workspaces remain charged to
  the existing brush GPU/CPU caches. Queue DTO/planner metadata and wash metadata
  reserve the **same** `BrushMipCache`; a conservative work-headroom check keeps
  queued frames from predictably consuming the next batch's metadata allowance.
  These estimates are not a hard JavaScript heap guarantee.
- Wash reserves the union of all **new** touched tile pairs for an accepted frame
  before any tile creation/write. Up to 64 sparse tile positions are admitted per
  gesture. The injected `reserveTransient` must use the engine's existing GPU
  fence, including the scratch pool's live **and idle** allocations. It is not a
  new GPU allowance. Rejection leaves the frame/gesture/pixels unmodified.
- Each touched wash tile lazily obtains one immutable original and one cleared
  local straight surface from the existing format-keyed `RibbonScratchPool`.
  Original pixels are copied on GPU before any local/present write to that tile.
  Preview/final present always reads that original, never the preceding preview.
  Full tiles are presented in integer subrectangles bounded by prepared capacity;
  source row order is explicitly GL-bottom and UVs are physical texel subrects.
  No per-dab CPU images, uploads or readbacks are introduced. Initial layer/scratch
  allocation and the once-per-touched-tile original copy are not hot cache hits.

## Failure and caller contract

The caller must serialize every writer to the gesture's layer, including peers,
rebase and undo. A same-layer external write cannot be merged implicitly with a
wash original. Each command rechecks layer identity/epoch. `changed` only records
invalidation; it must not issue arbitrary GL, mutate resource lifetimes or yield.
All callbacks and service turns are synchronous.

`checkpointReady` stays false while a gesture is open, any work remains, or the
executor is poisoned. A genuine execution error/cancel calls `poison` to mark the
layer unsettled and block checkpoints until the caller rebuilds from the trusted
checkpoint plus ordered accepted journal. The executor drops its cursor and
never retries against dirty pixels. A rebuilt layer uses a new executor.
Cleanup detaches cursor/maps before callbacks, attempts every owned release even
if another callback throws, and preserves the primary draw exception. Additional
notification/release failures are exposed through bounded `cleanupFailures`;
normal cancel reports the first cleanup failure only after attempting them all.

Normal cancel returns scratch surfaces to their shared pool. `cancel(reason,
{lost:true})` rejects while GL is live; on actual context loss it forgets own GPU
handles and frees only metadata/reservations. The engine cancels **all** owners,
then calls the one global `pool.forget()` before recreating the context. No new
GPU capsule or permanent premultiplied sidecar is used.

## Scope and proof boundary

Initial scope is unmasked, single-primary canonical opaque-gray PNG material,
constant recorded operation RGB, explicit `optimized32-scalar-f32-rne-v1`
AlphaDarken and `portable-f32-division-rne-v1` Over. These names do not claim
Android factory/SIMD dispatch or complete native Krita identity. Unknown source
levels, dimensions, stale epochs, budget excess and interleaved gesture contexts
reject rather than fall back.

Focused CPU/MockGL tests use the **real** finite bank, prepass, composite pass,
scratch pool and tiled layer: queue/chunk control continuity; logical draw across
four tiles and forced cooperative yields; actual eight-tile eviction budget;
immutable wash base and bounded presentation; full union preflight rejection;
partial failure poison/no retry; stale epoch; cancel/lost cleanup; caller DTO
mutation. MockGL proves lifecycle/control flow, not raster bytes. New executor
whole-pixel device acceptance is still required; earlier isolated shader/service
receipts are not automatically an executor proof.

Not implemented here: operation schema/ACK transport, local author packet
creation, engine replay/undo/checkpoint drain integration, concurrent writer
rebasing or enabling straight rooms. These must bind accepted frame ordering,
authoritative layer epochs, snapshot blocking and resource cleanup to this SAME
service instead of constructing a second renderer path.
