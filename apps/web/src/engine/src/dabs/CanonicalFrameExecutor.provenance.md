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


## Actual Samsung service acceptance

Executor `805614028` (base `a0526e129`), composite `d24c0d763`, original explicit
scalar profiles: **17 presets /3256 logical draws /203 decoded frames** over real
straight `TiledLayerBuffer`256×256 and shared format-aware scratch pool. Independent
CPU expected final hashes match the previous accepted17-profile receipt. Every
completed frame's output FNV32 matches; final512×256 RGBA compares all8,912,896
bytes: wrong0/maxDelta0. GL[], hotUploads0, caller stateRestored, no poison,
cleanuptrue; tracked texture/FBO/buffer/program/shader counts all0.

That first crop is world[0,512)×[0,256);31 negative tile allocations alone do not
prove out-of-crop pixels. A distinct supplemental gate repacks/decodes #28buildup
and #84wash with integer translation(-512,-256), unchanged recipes/subpixels and
translated seed viewport: **1310 draws /3frames**, entire negative crop
world[-512,0)×[-256,0), all1,048,576 RGBA bytes exact0difference. GL[], hotUploads0,
state/cleanuptrue. Device: Samsung SM-T970, Adreno650, Chrome155, WebGL1 highp23.

Ignored evidence under `temp/device-runs/krita-stroke-20261024/fixes-v52/`:
`canonical-stock-executor-full17-device-result.json`, corresponding negative
receipt, host expected/source/bundle/config hashes, cleanup receipts and
`canonical-executor-gates-summary.json`. Earlier accepted receipts were not
replaced. These guard/readback-heavy runs are correctness gates, not performance
acceptance, cross-GPU equality or engine/wire/undo/snapshot integration.

## Target-allocation admission

Each frame now reserves an upper bound for its complete target tile union before
any layer resolution/allocation or pixel writes, in buildup as well as wash mode.
Wash presentation/commit revisits all previously admitted wash tiles, including
an empty gesture-end tail, so those targets enter this union too. Targets can be
evicted between enqueue and execution; currently resident tiles are deliberately
included. The frame token releases at finish/cancellation. Wash-pair tokens stay
separate and survive until the gesture ends or is cancelled.

At most 64 target coordinates are admitted per frame, matching the existing
bounded target lifetime domain. This is not a 64-tile buildup gesture limit:
subsequent frames can continue elsewhere, covered by the 65-tile regression.
A caller must packetize long sparse strokes within this bound before UI activation.
These are conservative reservations, not a claim that every target is newly
allocated. Actual layer/pool storage must remain charged after token release;
engine-global ownership/materialization accounting is still an activation gate.

Negative tests cover both modes refusing a target reservation before allocation,
queued token lifetimes, wash empty-tail targets, excessive frame unions and new
material profiles rejected before image asset access. The successful pixel path
is unchanged; older frozen device receipts do not certify this new admission
policy. New source-material profiles still require their explicit resolver branch.


## Closed incremental default-auto wire2 path

The submission accepts shared-decoded V1 images or wire2 source frames. options.autoSource is fixed at construction from an already verified descriptor/room capability, normalized and copied before frame admission. Each auto definition is checked against that pin; a frame cannot self-grant a new source, size override or coverage profile. A gesture cannot switch wire profiles. Image definitions still require prepared CAS bank resources; true auto-only frames use no bank/CAS and must have assets[]. SourcePrimaryComposition widens only accepted framing, retaining the same opacity/order law.

Before GL state capture and target resolution the existing work cursor advances one auto evaluator, checking its cooperative four-millisecond turn budget from BEFORE preparation. Sample quantum64 bounds arithmetic work, completed-pixel packing is incremental, and upload remains one bounded stripe. Queue admission retains headroom for the existing CPU budget's <=82432 byte stripe/cursor reservation; a generation/cache hit adds no new quota. Target leases and GL batches never cross yields. The next different auto definition waits for its own preparation; partially consumed recorded draws are not replayed or dropped.

Authoritative pageBounds is copied at construction (absent retains prior closed infinite-page QA API). Both admission and execution use common planCanonicalTargets before enumerating/resolving tiles. Fully clipped draw pixel work is skipped while its logical composition update remains once per source draw. Full storage targets and original mask rects/UVs stay unchanged; tile/page intersections are passed as writeBounds to local composite and page bounds to wash preview/commit. Target-aware author packetization remains a separate UI activation gate.

Host real7/pressure30, forged-pin, cooperative pending cancellation, native84/56 sample-range tests and page clipping/lifetime mocks do not constitute final GPU auto raster proof. No active painter/room/codec admission was enabled by this unit.


Cooperative regressions also force a final upload to consume the remaining budget: the completed mask is retained, target resolution/compositing waits for the next turn, and the next turn is a zero-upload hit. Initial preparation/cache lookup consume the same turn budget. Long fully clipped scans check every16 draws and preserve the exact cursor on yield. These controls prevent stacking fresh GL work on spent CPU time; they cannot preempt a single allocation/upload/native call.


The bank is now optional at construction: real seven-source routing tests construct NO image bank/CAS dummy. Auto-only recorded frames never access a bank; image/mixed frames require an actually prepared bank before target reservations or writes. V1 empty-tail frames keep their image readiness semantics. Missing auto authority still rejects before reservations. This is the same executor path, not an empty-bank implementation or a second resource budget.


## Actual prepared capacities and structural completion

There is no caller-supplied executor capacity anymore. Prepass and compositor each return a frozen metadata snapshot {width,height,epoch} without GL queries; the opaque existing workspace identity binds the snapshot. Constructor pins BOTH preparations, enqueue and advance reject changed capacity or reset/reprepare (even same size/new epoch) before target resolution/pixel work. Recipe allocation is checked against actual mask storage. Wash presentation parts use actual compositor scratch independently of the brush's tiny extent. Old receipts with an explicit executor capacity remain immutable proofs of the older source, not proof for this new API.

When a local mask/page/tile intersection exceeds actual compositor scratch, the SAME Work cursor stores paintPart and splits the half-open write region into nonoverlapping scratch-sized parts with short final edges. The original full mask rect/UV/mirror and full layer/local target remain unchanged. Native source/average-opacity controls are computed once per logical draw; each part receives those same controls. A yield retains draw/tile/part indices; cancel poisons/rebuilds rather than duplicating a possibly written part. No extra queue, layer, raster cache, quota or source query is added.

If logical source framing has no pixel work and no accumulated wash surface needs preview/commit, finish releases the recorded frame metadata/target reservations directly, with no state snapshot, GL batch, target acquisition or GL queries. Gesture/input fences and frame ordinal were already advanced once by pure admission. In particular an empty final tail with existing wash tiles STILL performs presentation/commit. Host tests cover all four empty source-fence chunks, clipped zero work, mask32/pass4 with negative/page-clipped/mirrored17x11 masks covering104 pixels exactly once, short edges, both wash/buildup, cancellation midpart and changed size/epoch before GL. Partial-capacity identity still requires the corresponding actual-device source receipt; earlier device snapshots are not rewritten.


Actual Samsung derived-capacity receipts (fixes-v52) now cover this source: `auto7-derived-capacity-64-result.json` runs all seven actual imported author→adapter→encoder V2 paths,89 frames/61 dabs, actual prepass64/pass64; `auto7-derived-capacity-8-result.json` repeats two real41/61px mask cases with actual prepass64/pass8, exercising BOTH local-part and presentation-part cursors. Final target comparisons to host source-law CPU expected are exact: wrong0/maxDelta0, GL[], no poisoned layers, state restored, all Texture/Framebuffer/Buffer/Program/Shader handle counts0 and CPU/GPU cleanup balanced. This is not an independent native GUI whole-stroke or active UI responsiveness proof; cold max71.5ms specifically prevents a UI performance claim. Parent closed its child/context, restored original tabs/parent, removed forward and reported DEVICEFREE.

Frozen executor SHA256 `2230d10b3eb3c503cc0f9557db102d85f43db60bf6ad9497bce80755a6f18c87`; prepass `2b555d0e2b695caa81f6b5863dd153a804b4c80648347ed8cab9dda4051f66f5`; compositor `6283501d5fbfe7d6c464551dd450d7ecde018773b3900975b3e3dc86fb3aba78`. Both receipts retain all9 source snapshots. Bundle SHA256 `e800cb351e68dbd5ba3fa2b7879f1eb9727351c0f2307ace25a5ea83ba6aae38`; body `a5d02e683e9fabebd13f351ac6d288bb6288475f915dbfef45ef785f88698382`; fixture64 `dd2eaea13f86e76fc5fd02b62f70f21b9f8d65d5e105d028f65fd685b1cf602c`, fixture8 `ec0ea4076013155aa559644457dfd4289d49e2d496b2f03b7342fdcae88976a1`. Old receipts are preserved unchanged.


## One full-state capture for a nonempty synchronous turn

After CPU generation/budget checks, executor uses runBrushGlTurn before direct tile allocation/copy, then passes its genuine synchronous authority to the existing paint/present batch. Finish/metadata and final wash cleanup run inside that same scope for nonempty turns. Structural zero-GL frames retain their earlier fast path. The inner batch borrows the existing snapshot, restores it before owner releases, and the outer finally restores that SAME snapshot after staging/final cleanup callbacks. Numerical recipes, local-part cursor, source opacity averaging and pixels are unchanged. One capture is measured by full-capture getter signatures, excluding this host mock's binding-query implementation of independent sampler/FBO identity checks.

Nested canonical ownership during target history recovery rejects before any composite pixel write and poisons accepted work for trusted rebuild. This is fail-closed behavior, not proof that arbitrary history-rebuild callbacks obey the direct preparation attribute/state contract. No new queue, renderer, quota or cross-yield lease is introduced. Earlier device receipts remain frozen for their prior source snapshots; this unit needs fresh actual7/pass8/state/phase-profile proof.


Fresh Samsung `auto7-one-turn-{64,8}-result.json` certifies this one-capture executor snapshot `285be6a1170e511a9ad6af66df3891aa3357f137622f64295f916137031d40f5`: full seven-source/89-frame61-dab gate and two actual large-mask/pass8 cases remain pixel-exact to host source-law expected, with state/GL/poison/handle cleanup checks. See BrushGlBatch.provenance for bundle/body/fixture hashes and honest profiling: full-capture queries halved, but a sequential cold timing did NOT show lower inclusive latency. No active UI/room admission was enabled; arbitrary reentrant history recovery remains a separate activation gate.

## Explicit deposition-only ownership for recorded concurrent washes

An opt-in `washMode: 'deposition-only'` retains each transparent raw local without
capturing an immutable visible original or writing outer preview into the stable
layer. Default `exclusive` behavior and existing numerical controls stay intact.
The raw borrow/one-time sealed transfer API moves actual scratch/reservation
ownership to the layer coordinator, never an opacity-applied preview or a GL
lease. Its own checkpoint flag cannot authorize checkpoints for a transferred
owner; `CanonicalWashLayerCoordinator.checkpointReady` must govern that lane.
See the coordinator provenance for first-recorded commit order, derived view,
cleanup tests and the explicit no-activation/no-new-GPU-proof limits.

## Gaussian in the same incremental procedural branch

The executor accepts an explicit trusted CanonicalAutoSource union, freezes its
generator-specific pin and compares EVERY definition using shared canonicalAutoCost.
Gaussian/default source/profile swaps fail before reservations or pixels; auto-only
frames continue to require zero image assets and no source bank. No new queue,
cache, raster math, CPU headroom cap or target allocator is added.

Both generator tags use the SAME prepareAuto sample64 cursor and4ms deadline,
including the completion-to-yield check, one-auto-draw staging boundary and
prepared prepass/composite capacities. The prepass supplies the generator-specific
coverage evaluator; RGB/AlphaDarken/outer Over still use the existing composition.

Focused executor54 tests include ready7 real imported Gaussian sources under
both scalar-Bionic and NEON profiles, decoded trusted V2 material through the
actual no-bank prepass/executor/Tiled pool and composite8 partitions. Uploaded
RGBA stripes match each sourceGaussianDab CPU reference, sample-deadline yields
before target/upload, and final CPU reservations/raw locals are released. This
is integration evidence, not a new native GUI stroke or GPU receipt. All52 prior
executor/coordinator tests remain green. Editor, server Gaussian policy, live
confirmation, global memory owner and stable snapshot gates remain closed.

Samsung SM-T970/Adreno650/Chrome155 closed-service proof now runs all seven
Gaussian source descriptors through actual author/adapter/packed-envelope decode,
actual no-bank executor/Tiled/scratch/prepass/composite64. The two largest mask
windows are repeated with the SAME prepass but compositor8. All9 final64×64
readbacks match the independent host source-law scalar composition oracle:
0 wrong channels/maxDelta0, exact hostile GL restoration, noGL errors/poison,
all owned Texture/FBO/Buffer/Program/Shader handles0, CPU and reservation cleanup
balanced. Both test children closed and parent3631 restored; forward19236 removed.

The first receipt requests NEON64 with its normal tiny-AA scalar fallback.
A separate scalar-Bionic requested-profile run at `f9beaff76` now covers the SAME
seven descriptors/compositor64 and largest two windows/compositor8. All9 final
readbacks again have wrong0/maxDelta0, restored hostile GL state, GL[]/poison[],
and zero owned Texture/FBO/Buffer/Program/Shader handles. Peak transient
reservation49152B is a local reservation measurement, not global GPU residency.
Both new children closed, original three tabs were preserved, parent3631 restored,
and the QA marker and forward19236 were removed. Scalar receipts are
`temp/device-runs/krita-stroke-20261024/fixes-v52/gaussian7-scalar-executor-{64,8}-{result,cleanup}.json`.

Host oracle uses the existing Gaussian evaluator and source composition
kernels; it is not an independent original Krita GUI stroke or UI-latency proof.
In particular the tracked13 Gaussian descriptors use25 sensor compile requests
with15 unique point/corner programs; these had no exact match in the earlier32
native-curve corpus. A subsequent independent installed ARM64 constructor audit
(`gaussian13-native-sensor-comparison.json`) covers all15: the diagnostic mapped
Eigen5 candidate matches120/120 coefficients, while the currently stored Eigen3.4
programs differ at55/120. The old production compiler/profile was deliberately
not relabelled. Promoting the verified new compiler and regenerating bound sensor
programs remains required before claiming whole original stroke identity. The
pixel receipts do not certify the original sensor coefficients.
Receipts contain exact source/bundle/fixture hashes:
`temp/device-runs/krita-stroke-20261024/fixes-v52/gaussian7-executor-{64,8}-{result,cleanup}.json`.

## Fixed primary soft source in the same executor

The explicit trusted auto source union now includes softAuto primary slot0. The
constructor snapshots the complete pin and reserves one soft program through the
existing CPU brush allowance. Its table is evaluated in at most64-value quanta
inside the same4ms cooperative prepare cursor, outside target leases/GL batches.
Each mask borrows that completed program through the existing prepass. Tables
survive completed gestures for reuse; explicit cancel or executor failure retires
the source and eventually returns its CPU reservation after any active borrow.
Cancel also retires a source that never accepted a frame. No new renderer/cache
allowance or active tool/server permission is introduced.

Decoded soft recipes must match that primary source before queue reservations or
target resolution. They use the same prepass masks, tiled wash/buildup composition,
frame cursor, mirrors and checkpoint gates as existing procedural definitions.
Tests feed an original native radial basis and independently recorded19x23 A8
mask through wire2 and the actual executor/prepass for both wash and buildup;
all uploaded RGBA replicas match the437 native pixels exactly. Forced time cuts
prove table preparation yields before GL/target access; a second gesture reuses
the same table without another advance. Untrusted/forged source slot rejects and
cold cancellation returns the source charge. This is host/MockGL integration,
not native GUI whole-stroke equivalence or tablet pointer responsiveness proof.

## Inclusive cooperative turn clock

The existing four-millisecond clock now includes target preparation and outer GL
capture in both paint and wash presentation, instead of restarting the effective
allowance at inner batch entry. Planning stops after an admitted task consumes
the allowance; its atomic draw completes, then the existing tile/part cursor
resumes next turn. This prevents allocating up to eight cold targets before any
time check. Individual driver calls remain non-preemptible, so four milliseconds
is a cooperative check, not a hard latency bound. A forced5ms-target regression
prepares only one target in a turn and renders all nine tiles exactly once.
58 executor tests and the common web TypeScript check pass. The initial Samsung
single-tile before/after corpus retains exact pixels but shows no overall timing
improvement; multi-tile scheduling and device timings are recorded separately.

## Shared fixed-source ownership across gesture executors

An explicit optional softProgramOwner allows multiple gesture executors to borrow
one prepared basis from the same CPU brush owner. It never creates a second cache
or budget. A foreign CPU owner is rejected before accepting frames. Executor cancel
and failure close that executor and its pending mask leases; only an internally
constructed source is retired by the executor. The caller retires a shared basis
after all consuming executors stop. Tests reuse one table for two executors with
no extra reservation or table evaluation, and verify coordinator candidate rollback
and teardown return source charges even for unaccepted/committed gestures.

## Explicit GenericSC outer pipeline V2

The new pinned whole-pipeline profile requires three prepared operations in the
same existing composite pass: fused AlphaDarken, fused Over and GenericSC U8.
Local deposition remains exactly the old fused law. A shared operation selector
in this module is used by exclusive wash presentation and recorded-layer folds;
GenericSC receives the fixed source-law kernel profile and no composite-mask
uniform. Historical/default Over still selects the existing fused kernel; the
reference profile remains diagnostic/Over-only.

Enqueue rejects mismatched profile/composition and non-Over buildup before layer
lookup, metadata admission, transient reservations or pixels. Tests execute actual
prepass/composite services through clipped tiled/yielded parts for every mode,
check identical preview/final operations and frozen caller policy, and cover new
profile Over wash/buildup plus unchanged legacy behavior. Room/editor admission
and server capability activation remain closed.

## Gaussian source data versus paint-binding correction

The historical seven-source Gaussian primitive/data coverage above is not seven
paint grants. Actual source2 retains behavior.erase=true even though its native
blend is normal. The now profile-aware direct source binding refuses it under
both old/new policies; current executor regressions use the six actual paint
sources5/6/7/10/11/22 and explicitly assert2's refusal. Shared codec data-only tests
still roundtrip all seven untouched sources via data pins. No native inputs,
primitive/GPU source-law evidence or erase metadata are normalized or rewritten.

## 2026-10-31: exact deposition dirty bounds

Deposition-only wash notifications may carry the already validated integer
`task.writeBounds` through the existing changed callback. Existing one-argument
clients remain valid. The same recorded-layer coordinator uses those bounds to
avoid refolding unaffected pixels; local source evaluation, compositing controls,
frame/history/seed/fence progression, storage admission and lease ownership are
unchanged. Full seal/commit invalidation remains conservative. See coordinator
provenance and R52/generic-sc4-advance-proof.json for independent multi-gesture
pixel tests and actual Samsung before/after measurements; remaining rare83.1ms
query hitch is explicitly unresolved.

## 2026-10-31: live raw-local sampler ownership

Only deposition-only raw lifetime creation now pins its actual straight/nearest
pool buffer and texture in an immutable internal ownedPointSampler declaration.
The same rawOwner alive epoch and existing lease guard reject stale texture or
retired ownership. The batch revalidates same-context/texture/epoch binding before
and after acquisition and before owned sampling. No shader, source generation,
composition, deposition controls or physical ownership changes. The standalone
composite path preserves foreign queries/restoration. See BrushGlBatch provenance
and the compact owned-sampler Samsung receipt for tests and measured query removal.

2026-10-31 follow-up: raw-local lease admission also requires the actual
AccumulationBuffer.storageOwnerCurrent metadata. A live rawOwner plus unchanged
WebGL names is insufficient after the physical ledger generation retires. An
isolated recording-GL test retires only its test ledger while keeping names and
isContextLost=false; the old lease wrongly succeeded, the new guard rejects before
incrementing raw leases. Production performs no ledger reset/forget or extra GL
query.83 executor/layer-binding tests, lint and combined app/SW TSC cover this
metadata-only guard. Existing709a41e58 Samsung receipts remain historical and are
not relabeled as measurements of this follow-up.
