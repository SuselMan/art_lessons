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

## Selected outer blend in recorded folds

Each entry now retains its first accepted immutable outer blend beside opacity.
Both derived presentation and stable commit call the SAME existing-pass operation
selector as exclusive wash. Deposition-only executors still produce raw local
surfaces before outer opacity. No new renderer, lane, sequence or queue exists.

Numerical tests exercise A0/B0/A1 over nontransparent existing pixels with different
mode pairs covering all four GenericSC modes, B sealed before A, copied caller
policy, preview/final byte equality, fused local deposition and post-cancel release
of all lifetime reservations. Legacy-profile GenericSC rejection happens before
binding, layer lookup or transient reservations. Existing cursor/order/fault/loss
and reference-Over tests remain active. Stable metadata headroom intentionally
remains owned until coordinator cancellation, even after checkpoint readiness.

## 2026-10-31: measured dirty-region fold and one cooperative clock

Samsung actual NEW source3/60..63 profiling found repeated whole-tile preview
folds after each accepted small deposition part: 11,968 composite calls for640
local draws. Sync GL state/sampler/attachment queries dominated worst preview
turns; CPU mask quanta stayed <=1.5ms. These are JS/API wall times, not GPU timers.

The SAME lane now receives an optional exact changed rectangle from its existing
deposition executor callback. Its existing per-tile dirty set becomes a cropped
integer rectangle union. First materialization and buffer/texture replacement
still force full stable copy+ordered fold. Subsequent previews use the existing
copyRegionInto and only intersecting raw-local parts, retaining unaffected derived
pixels. Seal/commit/rebase notifications still invalidate full regions. No queue,
renderer, pixel mirror, new quota or room grant is introduced. Identity metadata
lives in the already charged position record and is released with cancellation.
Every existing owner lease, foreign sampler guard and full GL state capsule remains.

Coordinator commit/presentation now count target/copy/capture preparation against
ONE advance clock, like the executor; after one accepted part, an exhausted4ms
cooperative budget yields instead of starting another allowance. Hard8 draw bounds
remain. An individual driver/query API cannot be preempted or promised to fit4ms.

Two baseline fault tests observed8 parts after a simulated5ms cold preparation;
both now stop after1 with forward progress. Independent per-pixel tests author
A/B overlapping and disjoint gestures over nontransparent pixels, partial updates,
B sealing before A, final stable order, stale first presentation and replacement
presentation target. Another test rejects malformed/unsafe bounds before dirty
metadata mutation and verifies cropped unions.

All79 executor/lane tests +57 service/target regressions, lint and combined app/SW
TSC39608 pass. Device before/after: same80 full64² RGBA observations each, exact0
wrong; composite calls11,968→3,099, turns2,944→1,329 under the same observer. Final
uninstrumented run also exact, turns2,399→1,234 against prior receipt. Rare max
advance84.7→83.1ms remains: this removes measured work amplification, NOT the
remaining unpreemptible synchronous-query hitch. Compact receipts and exact module
hashes are in R52/generic-sc4-advance-proof.json; all own device resources removed.


## Opt-in active original retention (resource lifecycle only)

Owner-only `replayRetention:{maxEntries,maxBytes}` enables a bounded journal in
this SAME coordinator. It is captured by value and grants no author/room/source
permission. It is absent from every engine/UI/wire caller in this unit; ordinary
wash admission/execution and CPU/GPU logical charges stay unchanged. Small empty
JS bookkeeping fields are not claimed to have zero literal heap cost. No
buildup, presentation publication, material7, numeric or source policy activates.

Only the already validated exact original `CanonicalRecordedInput` is retained;
its existing delivery, lifetime, whole snapshot and prefix checks still run.
There is no cloned delivery, new provenance registry, decoded historical frame
archive or page-array hold. Existing indexed ingress keeps exact input authority
with its joined origin after page release/finish/cursor cancellation. That
existing lifetime contract is reused, not changed. Origin/epoch replacement and
coordinator retirement invalidate work. Existing indexed lifetime tests already
cover release/reopen/cancel; this unit does not duplicate them.

Every recorded entry conservatively charges its own ENTIRE validated `input.read`
JSON metadata extent, even when snapshots happen to be equal. It never assumes
object-identity deduplication across pages/operations. Additional charge is
`2*JSON.stringify(input.read).length + 512 + 2*sum(length of gestureKey, operation
id, user id, layer id, stroke id, brush id, materialPacked)`. Closed ingress
metadata is already bounded; the temporary serialization is not retained. This
is existing logical CPU resource accounting, not a literal JS heap bound or an
extra budget. Fixed512 covers holder/index/scalar metadata; all variable retained
read/context metadata and operation strings are explicit. Both maximum entries
(1..1024) and safe positive byte limit apply including retired entries still
pinned by a work snapshot. Reservations precede retained journal publication and
promotion callbacks. Capacity failure throws BEFORE acceptance; it is not a false
result that could wait forever for an unadmittable END. This unit does not solve
long-cohort overflow progress or manufacture a replay read fallback.

Local payload shares its existing charged receipt allocation: one journal hold
adds512 holder bytes and defers that receipt's idempotent payload release. It
never clones/recharges the packed payload. Local snapshot/context ownership is
already charged by the existing entry metadata and is deferred if work pins it.
On exact original promotion, reserve only the positive delta (including the new
original read metadata) BEFORE receipt release, then existing same-operation,
whole-context, current lifetime/layer checks run. After confirmation, the SAME
journal entry switches to the genuine original; no second executor enqueue or
invented sequence is created. Failed reservation/mismatch leaves the previous
journal/receipt/prefix intact and the same genuine retry usable.

One owner-only work snapshot can be held. It reserves256+32*entryCount before
allocating the additional bounded entry/value/owner/root index arrays, then
rechecks current ownership/count/generation/order after the reservation callback.
It visits FIRST-recorded-gesture order with per-gesture ordinal order, retains
actual bank child leases for relevant roots, and pins existing entry metadata.
Captured values are frozen borrowed references, not wire/execution grants. The
exclusive internal consumer must drop borrowed arrays/references before releasing
its work pin. Handles detach arrays/root references on release. Matching promotion
keeps work payload alive; real order changes invalidate old work rather than
silently reordering its stream. Entry metadata/root pins survive stable commit
until the work releases them. Actual source root leases are resource ownership,
not independent visibility or source-semantic authority.

The snapshot contains accepted FRAME references only. Interrupted-close envelopes,
metadata Undo/Redo, recorded sealing and visibility remain with the existing
Entry/prefix/history owners; these values ALONE do not reconstruct a complete
historical replay or prove an accepted cut. A future coherent replay unit must
also retain/prove the correct seal, history decisions and lifetime, and supply
borrowed genuine source bindings to the executor. Atomic old-visible/candidate
publication and its overlap budget remain separate approved design work.

Commit retires the matching gesture journal; pinned work delays payload/metadata
release. Cancellation invalidates generation, retires all journal entries, and
attempts snapshot/root/metadata/executor/receipt cleanup even after a cleanup
error. Reservations are forgotten once before callback release; secondary errors
are collected through existing cleanupFailures. Snapshot/receipt release is
idempotent. No GL queries, shaders, new renderer/cache/queue or network changes.

Gates (RAM overlay only): existing public tryEnqueueLocal accepted a maxBytes1
case on baseline (meaningful RED, not missing API). Final77 tests/2 files PASS,
including existing64 controls plus13 lifecycle/ledger cases. Genuine Basic6
image inputs come through normal source author/encoder and original room-state
preparer, then actual root-residency bank retain/publish/release; no fake lease.
They prove root child and entry metadata survive stable commit and cancel,
then final CPU/root membership returns zero. Other cases cover distinct normalized
read metadata per consumed continuation, frozen references, first-gesture order,
pinned local promotion without duplicate enqueue, denied reservation/capacity
and exact retry, pinned retirement, order invalidation, cleanup failure all-attempt,
and snapshot denial before extra pins. Final strict app-options3 roots281 inputs
0 diagnostics; explicit3-file RAM oxlint exit0, no ignored files; format-only
new methods/tests have AST-equivalence receipt. Earlier fixture-only full-bank
prepareJob-on-root error, initial missing targeted Node test types, private
unused-method diagnostic and prior metadata undercharge receipts are preserved.
No device/GPU/performance, complete replay, online behavior or full app gate claim.


### V2 final work-claim callback fence

Independent review found that the V1 final source/layer assertions could reenter
another snapshot after the first busy-slot test. V1 then overwrote replayWork,
leaving the inner snapshot unowned by cancel. V2 repeats work-slot, captured
count, generation/order and exact live-entry identity tests AFTER all callbacks,
immediately before pins and publication. No external callback separates
that fence from the synchronous slot claim. A genuine image-root regression
reenters exactly from the final layer assertion: outer refuses, inner remains the
current snapshot, rejected outer child is released, and cancel revokes/releases
inner with CPU/root membership returning baseline. Frozen V1 and its passing
77-case receipts remain preserved; this is a new meaningful reentry regression,
not a missing API or fabricated root. Final V2 gates recorded separately.

V2 final gates: exactV1 production with the new genuine nested-root assertion FAILED (outer did not refuse), then V2 full78/2PASS and strict3roots281inputs0 (PIDs3896093/3896258 ended); explicit3-file RAM oxlint0/noignore and apply-check0. Input map before/after worker matched0926a7084cc825ef338be6b1a51b8824800cb7b731a6fa94dbcbe8849e9d3630. All original V1 artifacts remain immutable.
