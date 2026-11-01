# Provisional local wash on the existing coordinator

The internal `tryEnqueueLocal(author, operation)` accepts a captured original
BEGIN lease, not a wire/profile/ACK grant. The actual engine caller must retain
only its immutable accepted snapshot/pin plus layer/generation/room lifetime;
it must not capture the retired CPU author/session/controller/program. Ordinary
Room/pointer wiring is not activated by this change.

The existing Entry retains bounded immutable envelope receipts, without guessed
server sequences, a second journal, renderer, queue or pool. One receipt retains
the original frozen operation reference and a decoder-normalized frozen frame;
subsequent mutation of nested caller data cannot change accepted deposition.
The existing CPU owner charges each receipt and the complete retained snapshot
(`2 * JSON.stringify(snapshot).length + 4096`, plus the existing entry charge).
The global receipt bound is 1024, alongside existing gesture/target/queue bounds.
A healthy full eight-frame deposition queue returns false before retention;
permanent CPU pressure throws before source/executor allocation.

Original `enqueueRecorded(input)` remains the only promotion path. It validates
original lifetime/scope, captured pin/context, id/user/layer/timestamp and the
complete normalized paint envelope including exact materialPacked bytes. The
server transport preserves frame timestamps; operationLog adds seq while copying
the existing header. Promotion never enqueues or deposits the same frame again.
Release callbacks finish before original/local owner revalidation and publication.

Known original first sequences order the SAME entries/raw tiles; provisional
unknown entries follow insertion order. Any unknown first sequence blocks ALL
stable commits. A local genuine END only seals raw ownership: unconfirmed frames
still block stable/checkpoint. Derived presentation continues. Network waiting
is not executable work (`pending=false`, checkpoint remains false); confirmation
invalidates the existing presentation only when visual order changes and makes
newly eligible stable work runnable again.
A server close over an unconfirmed speculative tail rejects for reconciliation.

Verification: three tests-first failures for the absent API; Final 28 recorded/local tests PASS; the previous combined gate passed
27 recorded/local plus 132 existing executor/coordinator tests (159 total), oxlint/diff clean.
The nonempty native-source recipe test obtains actual raw wash storage and proves
its ownership/source-call/upload/draw identities survive promotion. Other tests
cover global ordering, queue retry, altered id/timestamp/paint, copied/stale lease,
nested input mutation, snapshot/receipt CPU overflow, release-time invalidation,
and real context loss with forgotten ledger (no stale-name deletion, CPU zero).
Recording GL proves lifetime/control flow, not GPU pixels or responsiveness.
Actual engine local-preview wiring and hardware input-to-visible measurements
remain prerequisites; no UI speed, room activation or native whole-stroke claim.

Joint app+SW 45674 passed before the final narrow local-reference retirement:
completed/cancelled entries now detach the local BEGIN lease before external
metadata releases. Its focused witness checks this from inside the release
callback. The next joint engine-wiring gate must include that tiny cleanup.

## Order-preserving original confirmation (2026-10-31)

Actual Samsung phase receipt `fixes-v52/samsung-phase-native-result.json` stopped
at first JS submission after BEGIN with76 spans, no truncation, and all11 method
overrides restored. The first pixel-bearing executor frame still had draw0/1
after cold target/scratch initialization. A matching recorded confirmation then
called `orderEntries` and unconditionally invalidated the sole unchanged entry;
two presentation calls consumed33.8ms before revision1 submission. This is
source/cursor evidence of initialization presentation, not first visible ink or
a GPU timing claim. Root owns the separate bounded pixel diagnostic. Full clipped
span/union evidence is saved in `fixes-v52/samsung-phase-native-analysis.json`
and `perf-first-submission-source-audit.md`.

The same comparator now checks adjacent entries in their existing bounded array.
Only an inversion sorts that SAME array and invalidates presentation. Sequence
promotion with unchanged visual identities preserves existing dirty work and
completed presentation; no extra array, queue, cache, profile or painted flag is
created. Confirmation still assigns authoritative sequence/receipts and unblocks
the same stable commit frontier. Real known/unknown sequence reorders still sort,
invalidate and rebase normally.

Three tests-first RED cases all failed on the unconditional revision change:
first matching confirmation after real target/scratch preparation but before any
draw; matching confirmation after actual provisional presentation; and an actual
two-entry reorder followed by a second order-preserving confirmation. The painted
fixture now honors its explicit ended argument so the new open controls contain
no fabricated gestureEnd. Existing painted controls all explicitly ended and
retain their prior packed bytes.

Final focused regression:71 tests in four suites PASS (9.59s, maxWorkers=2,
testTimeout=30000), covering coordinator recorded/local ordering plus actual
engine layer, pointer author and open baseline lifetimes. Existing original
stable-commit blocking and queue-pressure/receipt checks remain included. Lint
and diff checks pass. Receipt: `fixes-v52/coordinator-noop-order-regression.log`.
No typecheck or new hardware performance improvement is claimed yet. No device,
process, forward, browser context or temporary runtime is owned by this unit.

Additional executor/coordinator regression:133 tests PASS (6.42s), including
ordered preview/stable composition and physical ownership cases, receipt
`fixes-v52/coordinator-noop-order-executor-regression.log`. Combined distinct
focused coverage is204 tests across five suites. Root separately observed a
perturbed longstroke first-ink detection after the earlier first JS submission;
that confirms the dashboard distinction, not a measured improvement from this
source fix. Final combined app/SW typing is pending root's coordinated freeze.

## Capacity refusal before repeated packed-body work (2026-11-01)

Actual A8 sourceProfile showed149 local admission attempts/56 accepted/93 queue
pressure false outcomes.23 pressure-only FIFO pumps account for46 false attempts
and8.5ms of admission JS (10.9ms whole pump). This proves redundant validation
work; it is not a claim that this change removes the separately measured339.6ms
coordinator rendering or improves physical pen latency.

`tryEnqueueLocal` now checks real full queue after original current/read, exact
header/context/author and namespace/previous-local/layer proofs, before decoding
the retained packed frame and deriving a throwaway prefix. A false result is only
NOT ADMITTED, never material validation, ordinal reservation or a source grant.
No decoded frame cache, queue, cap, shader/pixel law or authority is added. When
capacity is free, the original decode/prefix/layer/late capacity/reservation and
admission ordering remains unchanged; its late guards still cover callbacks.
Valid queue-full attempts do not add GL queries: they retain the original single
layer proof while skipping packed work.

Error priority deliberately changes ONLY under full capacity: namespace/current
layer errors may precede malformed material, while material/prefix/duplicate
validation is deferred until capacity exists. Such a frame is never accepted
while deferred. One existing ninth-frame test now explicitly expects duplicate
false while full, then drains actual executor work and still expects the original
prefix rejection. No accepted duplicate or cleared pending state is permitted.

Tests-first: clean source baseline2 semantic FAIL/3 controls PASS. A frozen valid
actual ninth frame with a transparent read-counting Proxy still traversed packed
body while full; malformed body also threw before refusal. Final source passes71
coordinator tests across5 files, then45 recorded tests after strengthening
explicit duplicate prefix/receipt/CPU/no-mutation assertions. Eight entries are
filled via actual tryEnqueueLocal and freed only through actual advance; no
private-array clearing, fake END, larger limit or paused-owner shortcut. Negative
controls preserve current author, namespace and changed layer failures while full;
a callback changing layer during real free-capacity decode still fails its late
layer guard. Same original frame accepts exactly once after actual drain; malformed
material then rejects without prefix/receipt/reservation mutation. Cleanup CPU0.

Targeted actual app-options/shared-source TypeScript PASS, scoped oxlint0 errors/
0 warnings, diff check PASS. Initial diagnostic red log included one test fixture
attempt to spy on a frozen layer getter; corrected fixture uses its actual epoch
callback and the retained final RED is purely semantic. Source-only checks do not
activate runtime or constitute a device/latency proof. No engine/index/UI/server,
shared/dist or protected foreign shader was changed by this unit.
