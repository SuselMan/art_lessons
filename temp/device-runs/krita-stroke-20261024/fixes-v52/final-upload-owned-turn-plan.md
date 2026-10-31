# Final auto stripe upload inside the existing owned turn

## Scope and source evidence

Production exact4 paths under apps/web/src/engine/src/dabs:
- BrushGlState.ts: optional two unpack flags plus narrow upload restore from the SAME snapshot.
- BrushGlBatch.ts: optional declared upload capture and genuine existing-turn borrowing.
- TransformedMaskPrepass.ts: defer ONLY final computed stripe in SAME pendingAuto; flush under genuine turn.
- CanonicalFrameExecutor.ts: choose next existing physical/pixel turn and flush first.

Tests exact existing3: BrushGlBatch.test.ts, TransformedMaskPrepass.test.ts,
CanonicalFrameExecutor.test.ts. Soft prepass tests remain regression-only.
No author/shared/codec/source math, coordinator, queue, renderer, pool, dependency
or device changes during this plan. Production edits approved after joint TSC85947; focused sourcefreeze follows tests.

Actual seam: Executor.prepareAuto calls Prepass.advanceAutoGeneration before
preparePhysical/paint. The final stripe uses saveAutoUploadState (five queries:
active unit, alignment, flip, premultiply, unit0 texture), then that SAME advance
may take a full BrushGlTurn (12 queries on Samsung VAO). Existing corrected
advance-only cold-child receipt retains12 such steps among72 selected slow
steps, with17 getParameter calls. Historical selection, not current total.
Non-final stripes keep their current path.

Two full restores around a borrowed batch are intentional and STAY: inner
restore precedes arbitrary owner/cache releases; outer restore follows cleanup.
Cache lease release can trim/delete GL resources; existing tests mutate GL in
release callbacks. Foreign isTexture/isBuffer and every sampler/FBO guard stay.

## Exact proposed API and state

1. saveBrushGlState keeps its existing five arguments/default callable return.
An optional sixth captureAutoUploadUnpack=false adds FLIP_Y and PREMULTIPLY
queries BEFORE any GL mutation. Return type is callable BrushGlStateRestore
with optional readonly non-enumerable restoreAutoUpload():void, present ONLY
when those flags were captured. The extra function restores the SAME captured
active/unit0 texture/alignment/flip/premultiply values, without new queries.
It uses the SAME all-attempt narrow restore law as legacy saveAutoUploadState:
restore unit0 binding, all three unpack fields, active unit last, preserve FIRST
exact error. Factor that narrow restoration into BrushGlState, reuse it from
legacy prepass (query order/default behavior unchanged).
Full restore adds both flags with independent all-attempt cleanup even if its
pre-existing restore body throws; original first error wins. No foreign
liveness checks are omitted. Default false retains old query/call behavior.

2. runBrushGlTurn({participants,captureAutoUploadUnpack?:true},execute) records
this declaration and the narrow restore in its SAME private TurnRecord. Charge
additional128 CPU metadata bytes through its existing BrushMipCache owner for
two flags/narrow closure/one-use bit (base4096 remains single, not GPU charge).
New internal borrowBrushGlTurnAutoUploadRestore(turn,participant):()=>void
checks genuine WeakMap token, active/unclaimed turn, declared flags, exact
participant/context/cache/epoch/attributes and healthy context BEFORE marking
one upload borrow or returning the narrow cleanup. A fake object/boolean,
expired/reused token, other participant or changed epoch cannot skip capture.
No new registry. The existing inner batch may still claim this SAME turn once.

3. advanceAutoGeneration(maxSamples,{deferFinalUpload?:true}) is opt-in.
Default one-argument behavior/result shape remains byte-for-byte legacy. CPU
sampling/packing/stripe sizes/maxSamples are unchanged. Intermediate stripes
still upload using the existing five-state capsule. When evaluator reports
DONE with final stripe buffered, opt-in retains only computed-final state in
SAME pendingAuto (already charged a8/rgba/evaluator/program owner). It returns
{done:false,consumed,uploadedBytes:0,finalUploadPending:true}; the slot is NOT
published ready and resolveGroup still refuses it. Subsequent deferred calls
consume0/no GL. A valid default one-argument caller can explicitly finish that
pending stripe through the old standalone capsule; invalid turn never silently
falls back to standalone.
Metadata finalAutoUploadPending(request):boolean checks owner/role/revision,
workspace/cache/texture residency and computed-final geometry. Healthy no-final
is false; stale owner/context is an error, never permission to regenerate.
flushFinalAutoGeneration(request,turn) validates actual pending owner/revision,
geometry, current workspace/cache and genuine turn BEFORE cache lease or slot
mutation. It borrows the narrow restore, leases the SAME slot, uploads ONCE,
then attempts narrow restore BEFORE cache lease release, preserving old trim
ordering and FIRST exact failure. Revalidate current owner/epoch before ready
publication. Only then publish current revision and release SAME pending CPU/
program owners. No GL/cache lease or turn token is retained over RAF.
Invalid foreign token/owner fails before touching the accepted pending owner.
Actual upload/restore/release failure cancels pending all-attempt; no publication
or retry against uncertain state. cancel/reset and lost workspace still release
the charged pending buffers/program once; no context reset/forget added.

4. Executor.prepareAuto opts in. If final CPU quantum exhausts SAME4ms clock,
retain charged pending and return WITHOUT full capture. No new Work readiness
cache: the source of truth remains Prepass.pendingAuto. Existing physical plans
may accept resident metadata under the same clock, as today.
A private executor wrapper for existing runBrushGlTurn sites checks whether the
current request has final upload pending. Only then declare unpack capture,
flush FIRST, and check SAME turnStarted clock before the allocation/init/draw
body. If exhausted after flush, return actual pending/checkpoint and do NOT
increment target/scratch/wash/draw cursors. The final upload itself is one
accepted bounded unit and must progress despite capture overhead; no retry loop
that repeatedly captures without progress. If budget remains, run the existing
body. Any actual allocation still yields once; last-init+paint keeps its current
ALL-init/time gate; no second copy or added eight-command budget. Empty C2 tail
still finishes before this path. No change to source/ordinal/opacity order.

## Budget and cancellation limits

Existing stripe charge remains live until actual flush/cancel. Peak CPU now can
include that stripe PLUS4224-byte opt-in snapshot concurrently. Reserve before
GL; denial releases all frame/pending owners through existing failure cleanup,
without relaxing limits or introducing physical double charge. GPU slot bytes,
source arrays, logical reserveTransient fence and physical tickets unchanged.
The full snapshot before final upload reduces eligible17 queries to14, reusing
three overlapping values. If capture/flush exhausts the budget, postponing the
body may cost MORE queries than the old five-only upload followed by a later
full turn. This is an explicit correctness-first decline, not an unconditional
query/latency win. Keep all declines/totals in actual proof; no4ms guarantee.

## Tests-first and gates

- Default one-arg upload still exactly five queries, same maxSamples, bytes and
result keys; existing PNG/default/Gaussian/soft fixtures unchanged.
- Deferred final CPU step emits no GL or readiness; same charged owner survives
return. Intermediate stripes still use standalone legacy capture. Explicit
standalone completion after defer is valid; zero-size/partial-row is rejected.
- Genuine opted turn flush plus ordinary batch uses14 rather than17 capture
queries; flip/premultiply true and false, hostile unit5/foreign texture/VAO/
no-VAO state restored before lease release and after outer cleanup. Default turn
adds zero queries. Wrong token/epoch/participant/second borrow fails before
cache lease; expired token never gains authority; same real turn remains usable
by its one inner batch after successful flush.
- Upload/setter/narrow-restore/cache-release/CPU-release faults: all independent
cleanup attempted, FIRST exact error retained, slot not ready, no escaped
cache/CPU/target leases or pins. Loss/reset/cache replacement while pending
rejects and retires actual pending owner, no stale fallback or double upload.
- Executor CPU final quantum at4ms has no capture. Upload exhausting4ms causes
no allocation/copy/draw or cursor advance afterward. Next advance progresses
once with SAME slot; allocation<=1, max8 draws, all clears before pixels,
last-init join/pending/checkpoint and C2 empty-tail invariants preserved.
- Scoped tests<=2workers, regression source/prepass/owner/batch/executor suites,
lint/diff, sourcefreeze ROOT review, ONE coordinated app+SW common.
- Physical Samsung only fresh owner FREE→ROOT→us and ACK before tools. Reuse
existing actual5 author/material/wire/executor/coordinator body, capacity64,
source-law oracle, baseline RAM37b162d95 overridden EXACT4 modules vs current;
all other module SHA/body/fixture equal. Two sequential strict-cleanup runs,
160 surfaces0wrongRGBA, hostile state, handles/owners0, no double uploads,
identical copy/draw counts; capture and report all query/turn/elapsed deltas,
including declines/regressions. No nativeGUI/editor/room activation or complete
finiteGPUcap claim. No extra service/runtime/dependency/disk bundle.

## Host sourcefreeze evidence

Baseline: 5 new failures / 206 existing passes. Additional retirement witness:
CPU-release failed after readiness publication (1 FAIL / 3 PASS); owned flush
now retires charged CPU before publication, legacy standalone ordering remains.
223 focused tests PASS including CPU-final expired budget (zero GL capture),
upload-expired resident/missing target (no allocation/paint; exactly one upload
after continuation), foreign owner/revision, stale cache, nested cancellation,
and upload/restore/cache-release/CPU-release first-error cleanup. Scoped lint
and diff checks pass. Fresh shared build55106 followed by common app+SW3284 PASS. Regression22/3files
PASS. Hardware not started, no device claim. Offline paired bundles contain117
modules with exact4 approved differences, fixture/body hashes equal.

Review followup: release callback invalidates workspace witness failed before
fix. Owned publication now rechecks SAME pending/workspace/cache residency and
strict context status AFTER release and BEFORE slot fields.224 focused PASS;
final common24110 running; previous3284 predates this narrow fix.

Final app+SW24110 PASS. QA-only body clone explicitly verifies both unpack
flags restored true under hostile state, resets them false before initial
pixel uploads. Observer flag queries remain outside inAdvance; exact SAME body
for both RAM variants.117 modules/exact4 differences preserved.
