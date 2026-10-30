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
