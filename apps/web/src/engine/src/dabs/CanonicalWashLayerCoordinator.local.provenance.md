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
