# Original image receiver: same-capacity hot union

This engine-only unit uses the same original Room read, recorded input delivery,
BrushPreparation work, bank, prepass, composite, cache and layer coordinator.
prepareOriginalRecorded is resource-only; appendOriginalRecorded remains the
synchronous journal admission boundary. Room does not yet call the new API.
Expected contention returns cancelled; callers must not reinterpret it as success
or skip an original frame. Growth, image authoring, animated frames and the Room
contention policy remain closed.

The bank generation is now a RESET epoch. Immutable additive keys/readers do not
invalidate previously admitted entries. Reset still invalidates them. An explicit
additive prepass update requires a superset of every old key/byte/binding, retains
physical workspace/dimensions/slots, and can retain pendingAuto outside a batch,
activeGroup or flushing upload. begin/advanceAutoGeneration already exclude an
activeGroup; this unit does not relax that physical guard.

The layer owns the lazy candidate and a union lease. Known bank, mask and
composite keys are deduplicated before upload against the same 16MiB allowance.
CPU admission includes already resident programs/metadata plus new bank metadata,
staged source/companion maps, maximum job scratch and original side-squared bytes
inside the existing 4MiB allowance. The side-squared allowance is a conservative
borrowed input overlap, not a second ownership claim for the global asset store.
Final creator-owned cleanup publishes only after original/current/readiness checks;
bank/maps publish without queries or callbacks. Union protection transfers before
staging leases retire. Destroy/loss owns a candidate even between upload jobs.
Selected procedural author pin and author-generation are preserved.

Actual Basic6 fixture/CAS/source pipeline is the existing sourcePngWholePath
GUI fixture: 122 unchanged input packets, 163 encoded envelopes, 40 draws, crop
53,53,150,150, static scale .05 in the original side256 resource. Host bytes retain
the fixture SHA. A second crop context is explicitly synthetic, uses the same
verified CAS and unchanged dimensions, and is not a native second-brush claim.
Recording GL proves ownership/order/cleanup only; it is not GPU pixel proof.

Tests-first logs in R52: image-hot-union-resource-red.log captures old epoch
invalidation; image-hot-union-map-red.log captures pending-auto rejection;
image-hot-union-engine-red.log captures actual OPEN-image constructor rejection.
A real Basic2 pointer remains down with a real pending auto evaluator while Basic6
cold resources upload; the test pauses advance rather than fabricating state.
Program, coordinator, epoch, evaluator/slot and local receipts survive. Original
B then original A confirmation enter without END or ACK waiting. Other tests cover
open-image continuation, distinct-crop hot upload, both typed partial closes,
genuine new full interleaved history, accepted OPEN context recovery, dirty-cut
recovery refusal, abort/upload/budget rollback, shared subscribers and CPU-zero
retirement. The old empty-history lane still rejects an open prefix before canvas.
No device, service, DB, dependency copy or runtime resource was created.

Final host gate: image-hot-union-final-await.log 13/13 PASS, including individual
original-lifetime expiration between work cleanup and promise continuation.
image-hot-union-author-rerun.log 32/32 PASS. The first paired batch had the existing
prewarm observer see an asynchronous layer target preparation; that raw failure
remains in image-hot-union-final-focused.log, was not reproduced standalone, and
root independently repeated author32 + image6 + preparation12 + publication10:
60/60 PASS (root-hot-image-regression.log). Resource26 PASS and scoped lint has
zero errors. Coordinated server-source/SW/map:check/map:rules passed. At this commit
the full app gate is pending an unrelated committed Stamp fixture context.version
type correction; no own hot-union type errors were reported. No app-wide PASS is
claimed here until that external fixture correction is checked.

Passive preparation follow-up (separate exact3 unit): a different finite active
BrushPreparation is observed through its existing whenIdle shared completion.
The receiver does not subscribe to/keep that work alive, cancel local preparation,
allocate a candidate, poll, wait a gesture/ACK or change author-generation while
waiting. After completion it reasserts original delivery/lifetime/engine and its
own signal, rechecks asset availability and the shared-run key. Matching ready
source and close remain immediate. A reentrant new active work is observed by
the same passive predicate loop, not replaced by the receiver.
R52/image-passive-engine-red.log captures the old immediate cancelled result;
image-passive-engine-green.log captures finite local work finalized BEFORE
candidate allocation. image-passive-engine-final.log:18/18 PASS, including stale
original lifetime, abort and real context loss during the wait with no candidate,
plus an existing ready original source bypassing unrelated pending work. This
does not activate Room or invent a context-failure recovery policy.
The passive follow-up's final full app gate is pending root's coordinated check;
its focused tests/lint passed. No separate typecheck or device run was started.
