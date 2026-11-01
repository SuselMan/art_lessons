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

## O3 original incoming capacity addition

Only an original recorded source preparation opts into retained capacity addition.
Local brush selection keeps the existing idle-only replacement rule. The original
still decodes and validates the full captured source/recipe before allocation;
there is no new source authority, queue, END wait or profile inference.

Image-bank jobs use the existing bounded preparation RAF lifecycle while A can
continue painting. The candidate retains only resource transaction ownership.
Mask/source update construction, all-current assertions and bank/mask/composite/
owner publication run synchronously in the work finalizer AFTER progress callbacks.
No O2 token spans a progress callback or asynchronous yield. Auto originals use
that same finalizer boundary. A false availability predicate remains cancellation.

Admission inventories include every retained prepass record plus incoming sources,
new mask storage and composite storage. The persistent published companion list
and owner pin contain the current default mask and bank, not retired record keys:
old captured participants already own their independent exact pins, and a later
retirement must not leave a stale mandatory composite companion. Composite epoch
checks and retained-participant UV/epoch checks remain exact.

Index copies/maps/unions have lexical CPU reservations based on the captured actual
inventory lengths before their materialization; the synchronous service query's
own temporary arrays are covered by O2's per-record/slot metadata allowance. Index
captures each service inventory once per phase and reasserts candidate/default
identity after reservation callbacks. Temporary index reservations do not become
another retained resource plan or change existing budget caps.

The counterfactual test reads ONLY the reviewed 37d100cb index from Git into a
Vitest in-memory loader; current tests and real Executor/Coordinator stay in place.
Both new partial/final-cursor tests fail the old idle guard (o3-index-red.log).
The first current-source pass exposed the Coordinator's genuine bare-capacity
assertion; its captured participant is the paired Stamp unit. Intermediate whole-B
fixtures then paused A while awaiting the existing queue-capacity barrier, creating
a test-only cycle. The corrected observer invokes the real finalizer, verifies
A's exact cursor/participant immediately at publication, then resumes the real
coordinator BEFORE waiting for ingress capacity. No timeout increase or production
queue bypass was used.

Current engine tests cover A CPU-midstripe and computed-final-upload, larger B's
whole original burst before A confirmations, ordinary later UP and export readiness;
OPEN image growth; generic OPEN A plus genuine original seeded-auto growth; and
abort, budget exhaustion, upload failure and actual context loss without journal
publication or surviving CPU reservations. The old cold-progress witnesses now
assert that cancellation happens BEFORE GPU allocation, reflecting finalizer-only
construction while retaining candidate, journal and cleanup assertions.

Terminal results are retained in R52/o3-index-*.log. This is host/mock-GL mechanism
evidence; root owns common acceptance and later hardware proof. No device, runtime,
build, service, dependency copy, publication or source grant was created here.

Review follow-up: a same-capacity image extension captures a genuine temporary
DEFAULT capacity lease (actual 2048-byte token reservation), rather than publishing
all retained records as permanent companions. That lease is retired independently
in transaction cleanup. The regression prepares Basic6 OPEN, a Graphite intermediate
record, then Mountains; it publishes a newly encoded real-Author crop binding at
that same final capacity, releases the intermediate lease, verifies those actual
old keys are gone, draws the new original stream and closes the original A. The
initial hand-edited crop/body was rightly rejected by the strict decoder; the
fixture now uses the same author/adapter/encoder under the changed material pin.
Healthy cycle retirement intentionally closes the old coordinator; the test checks
its empty cleanup failures plus the current owner's ready/retired state, rather
than treating that deliberate closed flag as a rendering fault.

A separate actual local lifecycle proof finishes and promotes generic A and the
incoming D stroke, reaches export readiness, verifies coordinator retirement, and
then uses public setPencil/setSize/prepareBrush for Mountains. Idle G2 replacement
succeeds without changing its rule to allow OPEN local selection.

Final index leaf gates: **65/65 tests PASS** (o3-index-final-full.log), targeted
actual-app-options TypeScript PASS (o3-index-target-final.log), scoped lint zero
errors with 18 existing index warnings outside this changed preparation section,
and git diff --check PASS. After that full run, one repeated pure composite inventory
query was replaced with its already captured identical inventory; the final targeted
TypeScript/lint checks include that exact source. Common root whole-source acceptance
and actual O3 GPU proof are separate; no claim is inferred from earlier immutable QA.

## Indexed cold CAS prerequisite regression (WIP RED)

A genuine indexed socket read now covers one112-frame CMAT3 source root split64/48, first64 stillOPEN and actual typedEND at ordinal111. Metadata/frame/context parsing, attachment, evidence and original local lifetime remain production code. Self-authored8px tip/pattern CAS starts absent from imported pixel memory. Only the existing availability-loader seam is controlled: it installs exact original tip/pattern bytes under assertCurrent; no fake root/view/read permission is minted. The engine must admit first original after availability, consume the firstOPEN page, request after64 before any published cut, then publish terminal112 with no additional history queue. Teardown destroys actualengine and asserts reserved CPU0.

Baseline c585662 source-alias run is honestly RED: `Canonical image asset unavailable` at engine7162→7148→indexed6817, before the ordinary availability loader is called. Receipt `R52/chalk35-indexed-cold-cas-red.log`. A first default-config attempt incorrectly resolved stale shared/dist and failed on missing helper export; kept separately as config-mismatch, not counted as product proof. No engine production fix or guard relaxation. Expected GREEN depends on UI agent's actual bounded indexed page resource prerequisite; cancellation/lifetime tests belong to that network ownership unit and must not be replaced with a manually prepared engine root.

The paired network prerequisite makes the112-frame cold regression GREEN: first64OPEN originals are consumed before requesting the remaining48; only real END at111 permits final accepted cut112. The empty terminal-page test response was corrected to contain no unused capability (strict parser unchanged); that harness-only failed-green receipt is separate. Original RED overlay body is preserved with its exact3d4692a3… hash beside the RED log.

The strengthened normal indexed client also calls the external API availability seam in three existing engine-only fixtures: the two selected-key cancel/context-loss cases and one selected indexed image two-gesture/promotion case in index.canonicalAuthor.test.ts. These tests already install verified original pixels but never set up an HTTP room-library session. Their scoped mock now asserts board room, exact original asset ID+side, original bytes and current before/after; author case additionally verifies pixel readiness. It supplies no root/read authority and changes no production API fallback. All original CPU-flat, selected default root lease identity/count, real promotion and cleanup assertions remain. The actual API's room-scoped catalog/side/current checks remain covered by the real API/network tests. Initial broad253PASS/3fixtureFAIL is retained separately; subsequent256PASS ran while the finite callback guard was being strengthened and is diagnostic, not the final stable-source gate. Final stable receipts and seven before/after source hashes are named in chalk35-indexed-cold-engine-final-freeze.json.
