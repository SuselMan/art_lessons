# Recorded same-layer wash ownership (closed integration unit)

`CanonicalWashLayerCoordinator` uses the existing `CanonicalFrameExecutor` in
explicit `deposition-only` mode. The default/exclusive executor mode is unchanged.
There is no new author, material decoder, source RNG, prepass, raster formula,
program family, cache or independent GPU quota.

The caller provides one authoritative recorded same-layer lane and a distinct
straight derived `TiledLayerBuffer`, plus the existing services/scratch/fence.
The sequence argument is recorded server order, NOT a local guessed sequence or
frame ordinal. First appearances append gesture identities in that order.
A gesture ID is retained as a bounded tombstone; `maxGestures` is explicit caller
capacity. This unit does not reconstruct a snapshot-cut unfinished gesture,
resolve unsequenced live acknowledgements, implement abort, or enable room/UI
rendering. All same-layer pixel writers still need an ordered barrier. A complete
trusted prefix/rebuild is required before constructing a replacement lane.

## Stable, raw and derived pixels

Deposition-only executes the SAME accepted decoded frame/opacity-history and
shared incremental prepass cursor. Each wash tile owns ONE transparent raw local
straight buffer; it does not capture the current visible layer as an original
and never outer-composites into the stable target while depositing. Raw source
RGB/alpha are not an opacity-applied preview. The last source fence seals raw
ownership. `takeRawWash()` transfers the actual scratch-pool buffers and existing
admission reservations exactly once. Views have an explicit synchronous lease;
mutation, transfer, release and cancel reject while such a lease is held.

A sealed gesture commits only at the first-recorded ordered frontier. If B ends
before A, B remains sealed/raw; it cannot modify stable pixels past A. Commit
applies the existing selected Over profile/outer opacity once. A partly committed
tile retains a cursor, not a GL lease; replacement of that target before remaining
parts execute rejects/poisons instead of silently redrawing previous parts.

The separately owned derived layer is reconstructed by copying each stable tile
and folding current uncommitted raw locals in the SAME gesture order. Every
invalidation restarts from stable, never from a previous preview. Its readiness
is false while rebuilding/committing. Each source part preserves the full raw
texture's bottom-at-V0 orientation and maps half-open scratch-sized parts; page
bounds are still enforced by the existing compositor. The real source deposition
has already consumed its image/auto transforms and mirrors once.

Checkpoint readiness requires the queue drained, ALL gestures committed, and the
derived view complete. This is a service result, not engine SnapshotIO wiring:
no server coverage rule or engine checkpoint owner has been activated here.

## Lifetime, work and budget

One call performs one existing deposition turn OR one <=8-command commit/rebase
batch, using `runBrushGlTurn` and one inner `runBrushGlBatch`. The existing soft
4ms cooperation applies after complete draws. No lease, batch token, async task,
program allocation or automatically scheduled RAF crosses a return/yield.
Capacity/epoch pins reject service reprepare and layer replacement. Recorded
frames are bounded by the existing aggregate queue of eight; metadata uses the
same CPU cache reservations. Derived tile reservations are admitted before
executor enqueue or any target allocation/pixel write. Raw admission reserves
raw-local plus possible stable target storage. Caller-owned stable/derived
buffers remain externally allocated; this is NOT a new global actual-memory cap.
The engine-wide actual owner, target recovery/replay ownership and authoritative
abort are explicit activation gates.

A genuine write failure poisons and releases all owners/reservations with cleanup
errors retained separately from the primary failure. Normal cancel returns pool
buffers. Actual context loss only detaches metadata/reservations; the engine must
cancel every owner, then perform its ONE existing scratch-pool `forget()` before
context recreation. Fake loss rejects before any ownership change. The service
never destroys caller layers.

## Host evidence and limits

The executor suite covers old exclusive operation behavior plus raw transfer,
lease guards and exact host/mock-GL orchestration for A0/B0/A1, B ending before A,
queued versus incremental replay, outer-opacity-once repeated rebasing,
predictable admission failure and genuine failure/lost-context cleanup.
The recording compositor still runs actual request validation/GL-state handling;
a CPU scalar pixel store supplies the independent sequencing oracle. Explicit
witness: A0 red128, B0 blue128, A1 red192 yields `[109,0,146,224]` at ordered
completion, while the stale-original A preview would erase B. No numerical
shader law is changed. These are host ownership/order tests, NOT new native or
Samsung whole-layer/device pixel proof. Prior executor actual-device receipts
remain limited to their frozen exclusive source.
