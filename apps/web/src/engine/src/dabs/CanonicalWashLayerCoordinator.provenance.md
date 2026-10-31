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

## Actual Samsung default-auto whole-layer gate

Frozen **`62c133fda`** engine/shared modules were loaded from Git into RAM by
esbuild, with no worktree/runtime copy. All80 dependency hashes were rechecked
against that same immutable commit after the run. The receipt does NOT certify
later Gaussian executor changes or active room/engine wiring.

`fixes-v52/wash-coordinator-device-result.json` covers8 trials: actual retained
circle40 and rectangle60/ratio.7 default-auto source recipes, same versus different
pigments, creamy/hard controls, outer opacity `.73`, prepass64 and compositor64
or8. There is NO image bank/CAS stand-in. Real packed V2 material frames feed the
real coordinator, deposition executor, two straight Tiled64 layers, scratch pool,
prepass and compositor. A0 is unfinished, the full B ends before A, then remaining
A frames close the ordered frontier. Stable and derived64x64 surfaces are read at
all3 boundaries: **48 surface observations /196608 pixels /786432 channels,
wrong0/maxDelta0**. While A is open stable stays unchanged, derived includes B;
completed stable/derived equal the independent raw-local A→B fold once. Host
expected uses the already proved sourceDefaultAutoDab and fused scalar CPU point
laws, NOT an opacity-applied preview, GPU output, or native GUI reference.

Actual highp23/Adreno650; GL errors[], poisoned[]. Strict before/after state checks
include active texture3, bindings and all4 sampler parameters, hostile render
flags/color mask, blend equations/functions, VAO/attributes/ANGLE divisors.
Repeated idle advances have no uploads/draws. No raw lease survives an advance
(max simultaneous2); all owned Texture/FBO/Buffer/Program/Shader/VAO counts end0,
CPU/cache/pool/reservations balance, peak reservation81920B (NOT global storage).
Maximum observed advance77ms is explicitly NOT a UI responsiveness guarantee.
Own child/context closed, original3 tabs preserved, parent restored, own forward
removed and job cleared. Initial harness-only missing-sequence and A0-only phase
counter runs are retained separately and are NOT the accepted full proof.

Bundle SHA256 `d832fbee005e3d6d4f916c9b1221c2008d9c3a2ee03221917713b2044ac6a592`;
body `0839f18610a95e9e220ba9c1a0bf1fb28d535533b5486c2d690b06658d273b4c`;
fixture `5a828f9f2d24a11234f070ef47a55ca8f910747d5bf50c64cb6806aa4d1f636c`;
result `6ec527fd6a9cad2a03aa98b465edbea71709df315291c879a1aba3168d3ff384`;
cleanup `17bd1c708682192a1c78cc7344c1384eee334000fe86fe82ba97b0c13d636a96`.
The private generator/runner/body, compact expected input, source snapshots and
summary remain reproducible under fixes-v52; no GPU pixel dump/runtime is kept.

Executor construction now retains a fixed soft source CPU owner. A newly created
executor remains a local candidate until its initial enqueue succeeds. Failed
admission cancels only that unpublished candidate, attempts every reservation
release and preserves the original error; an existing accepted executor survives
a rejected later frame. Coordinator disposal cancels every executor, including
entries whose raw wash ownership was transferred or committed, so fixed source
owners retire too. External borrowed source owners remain caller-owned under the
executor contract. Native-soft lifecycle tests cover repeated forged admission,
source callback failure, secondary cleanup failure, accepted-entry recovery and
post-commit CPU baseline restoration.
