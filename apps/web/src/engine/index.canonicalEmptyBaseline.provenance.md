# Original ended empty-room baseline in the real engine

Canonical rebuild wakeups use the same engine-owned AuthorTaskScheduler as
the author FIFO. The existing RebuildJob retains its own wake token; cancellation,
loss and destruction cancel that token before retiring the candidate. A delivered
stale callback checks the actual job-map identity before touching GL. Cancelling
author input closes the scheduler only when it is idle, preserving another
owner's accepted wakeup. Success/failure closes idle ports. No additional queue,
renderer, scheduler instance or source authority is introduced.

The reason is measured rather than assumed: the Samsung 208-turn baseline
accumulated about 840 ms between recursive zero-delay timers. This transport
change does not address the separately measured synchronous shader compilation
stall or establish live-pointer responsiveness. Pixel equivalence and elapsed
time still require a fresh hardware comparison.

The explicit `canonicalEmptyRoom: { read, tail }` constructor option admits only
straight RGBA8 storage after the original read verifies its original full tail.
The normal room constructor path remains closed. The actual captured bounded
room geometry must match explicit page dimensions before canvas access. The
first domain is the implicit layer structure, one source-only wash profile,
no assets/masks, and genuinely ended gesture prefixes; unsupported histories
fail before GPU allocation. This is neither default editor activation nor
permission to replay arbitrary canonical operations through legacy writers.

The existing RebuildJob scheduler advances the existing source prepass,
composite pass and wash coordinator. Recipe/tile dimensions determine their
capacities; the existing 16 MiB GPU cache and 4 MiB CPU cache admit companion
resources. A separate finite logical transient fence bounds U*B + 2*sum(Tg)*B
and obeys the engine GPU allowance. It is not a second physical storage ticket
or a claim that every hardware allocation has a complete global cap. Existing
pool/layer preparation performs physical ownership admission.

Every original authority callback precedes final pure engine/context/map/job/
geometry checks. The actual journal's guarded empty CAS invokes the synchronous
validator after preparing all entries, then publishes the journal immediately
before one `_layers` map assignment. No callback/GL operation intervenes.
Precommit failures retire candidates and preserve old layers/journal. After
commit, retirement is all-attempt and diagnostics return alongside
`committed: true`, so cleanup failure cannot masquerade as a retryable restore.

Stable straight tiles use the actual engine-owned straight-to-PM display seam.
Public legacy pixel writers remain independently closed for this storage;
pointer methods stay inert and unlocking cannot grant writing. Accepted ended
history now recovers through the same RebuildJob after physical context restore,
with a separate canonical readiness gate. Its exact journal array, entries,
original input references and revision are never replaced or republished. The
ordinary room path and unsupported legacy PM area-read interpretation stay closed.


Validation (2026-10-31): 11 actual-engine tests pass: genuine empty cut; copied
owner refusal with zero canvas access; real source frame through real job and
services, original global sequence/input retained, actual PM display route and
no legacy gl.finish; open/geometry refusal; prepare failure; cancellation;
original-authority CAS map reentry; committed cleanup diagnostics; loss/physical
restore refusal and stale-name-safe destruction; partial GPU draw failure; and
second implicit candidate creation rollback. Postcommit retirement walks the captured
old owner list, so even a throwing destroy callback that deletes another old map
entry cannot hide that second owner from cleanup. The GPU fault executes the real
composite draw before throwing and checks old publication plus pool/CPU cleanup.
Local supplements cover missing legacy MockGL state observation only; these
are lifecycle/dispatch checks, not hardware RGBA or native whole-stroke proof.

The independent read-only frontier suite has 8 passing tests, the existing
display suite has 8, and 181 regressions across 10 suites pass (context restore,
initialization rollback, lifecycle, raster admission, tile-rebuild lifetime,
display batching, restored base layers, canonical admission, executor and
coordinator). Focused lint reports no errors; index retains historical warnings.
Joint app/SW typecheck 78913 passed after the final captured-owner retirement
follow-up (1826 also passed before it). Architecture map check passed for 1494
files; boundary rules report zero errors and 24 existing warnings.
No device, runtime, background service, forward or browser child was created by
this unit. No push or ordinary room/socket/controller activation.

## Accepted-prefix context recovery follow-up

Physical loss increments an engine generation and forgets dead ledger ownership
before candidate cleanup. Restored physical GL availability does not grant pixel
readiness. Accepted metadata retains original read/tail, journal revision, array
and entry identities, and accepted generation. Duplicate restored events cannot
initialize another scene. A new scene is built by the same transaction and job;
only the layer map is published after final original callbacks and pure journal/
generation/job/map checks. Recovery calls no journal mutator, including empty
prepend or confirm.

Initialization rollback captures both physical generation and scene identity;
a stale closure cannot destroy mutable owners in a replacement scene. Healthy
allocation/draw failure deletes current resources and closes plans before a caller
can explicitly retry the same original owner. No automatic healthy-failure retry
is scheduled. An interrupted uncommitted initial restore stays closed until an
explicit retry reinitializes the missing physical scene. Paper retains ownership
of a successfully initialized live placeholder on later authority failure.

Display/compositor, pickColor and export/preview entry and asynchronous resumes
require accepted pixels; public straight reads also check actual physical loss.
Legacy PM area-read/fill semantics remain unavailable. Snapshot/replay bakes stay
closed independently. Public pixel-writing policy remains unchanged.

Tests-first recovery witnesses failed before implementation. Final host validation:
98 tests across six suites pass (18 actual baseline/recovery tests, the independent
8 read-only tests, 8 actual display tests, and existing PM network snapshot/export/
preview suites), plus 181 regressions across ten suites. Recovery cases cover
unchanged real journal identity/revision/entries; duplicate restored; stale owner
before any allocation; pending read/export/display closure; healthy allocation
rollback with all newly created programs retired; real composite draw then throw;
explicit same-owner retry; repeated loss; invoking an unretired successful old
rollback after scene replacement; and interrupted initial restore retry.
Lint has zero errors (existing index warnings); diff check passes. No hardware
pixel/context-recovery claim is made by these MockGL lifecycle tests. No device
resources or background runtime were created.

Final review added pure accepted-entry checks at admission and after original
authority callbacks: done/nonpending state, server sequence, exact canonicalInput,
the actual saved normalized canonicalRead wrapper, saved op reference and original
frame/id/user/layer identity. OperationLog deliberately normalizes canonicalRead,
so its proven wrapper is retained rather than falsely requiring it to equal the
input read object. No journal JSON reconstruction grants authority. Actual
original-owner callbacks mutate state/serverSeq/frame without bumping revision;
all six preallocation/final-publication witnesses refuse the mutation.

The final interrupted-initial-restore retry also proves paper.init runs exactly
once and owns a non-null texture before readiness. It uses the same fresh-scene
rollback marker as accepted recovery, not only the accepted-history mode flag.
Latest own actual-engine fault suite: 24 passing tests. Earlier six-suite matrix
98 and ten-suite regressions 181 passed before these narrow final witnesses; no
blanket hardware or smoothness claim follows. Joint app/SW 81467 passed; the final
app-only check 96250 after mutable-entry/paper fixes passed.

## LS2 — consumed indexed original restoration (WIP, 2026-11-01)

The engine consumes `CanonicalIndexedRead` issued by the actual authenticated socket ingress. The constructor checks that original read and its captured geometry/profile before GL access. Page release drops page iteration ownership while original input provenance remains under the joined parent lifetime. The same rebuild job/coordinator performs raster work; only the complete terminal cut publishes the candidate map and the SAME Log's accepted cut. Historical LogEntries are not fabricated or retained. Aggregate visible frame counts preserve `hasLayerContent`; synchronous `getOperations()` refuses to masquerade a suffix as full history. JSON export instead reopens the actual original cut and serializes pages into the intentional download Blob.

HOST recording-GL evidence (no physical pixel claim):

- `ls2-engine-current-regression.log`: 59 tests / 2 suites pass, including 72 gestures / 2160 genuine original inputs and a nonempty OPEN source crossing 1030 released-page inputs.
- `ls2-engine-follow-export.log`: three focused cases pass: bounded actual FOLLOW cut publication with SAME physical owner, original metadata handoff without advancing accepted cut, and genuine original JSON export without Log mutation.
- `ls2-engine-recovery-first.log`: actual full reopen restores the same accepted cut, SAME Log/entries/revision after context loss.
- `ls2-engine-stale-page.log`: stale genuine page arrival cannot publish and releases all candidate CPU ownership.
- `ls2-engine-history-final.log`: async original history selection suppresses duplicate pending requests and emits one request without optimistic journal edits.
- `ls2-engine-target-image.log`: targeted source TypeScript passes (including the existing image test file). Shared source alias is explicit; shared DIST was not rebuilt.

FOLLOW is limited to actual dense ranges of at most 64 originals / the shared byte bound. Only frame/close originals append; actual metadata is handed to the paired U3 callback before any metadata append. A finite wire cursor reaching V does not itself publish engine/log V. The final cut ticket checks the expected published cut, genuine suffix identities, placement/state, journal revision and original callbacks before pure publication. OPEN summaries remain bounded and their retained first packed frame plus snapshot are charged to the existing CPU budget. Recovery preserves the summary at accepted C before replaying its retained suffix.

Still WIP: whole paired review, broader failure matrix and actual GPU/online gates are not claimed by these HOST receipts. No runtime, device, service, policy activation or publication was performed by this unit.

Final HOST source gate (still uncommitted pending paired review): `ls2-engine-final-regression-verified.log` reports **160 tests / 5 suites PASS**. This includes the approved existing `index.canonicalImage.test.ts` and `index.canonicalAuthor.test.ts` integration cases, plus the existing recorded coordinator suite. Actual Basic6 authoring now confirms an OPEN prefix of more than eight emitted frames through genuine bounded FOLLOW before ordinary continuation/UP; a second gesture reuses the same prepared source lease without another bank preparation or program compilation. Actual Mountains four-frame and Graphite seven-frame roots stream through the same resource owner. A quiescent source-map replacement retires obsolete closed-root bindings; OPEN owners still use the unchanged additive source/capacity path. No resource quota was increased.

The existing tilted Marker observer initially failed identically against immutable committed engine/index + Coordinator at `9ead6d1886034d33a9d0ec0ea1da15fd956ea2ff` (bare public `beginAutoGeneration` observation reported 0 instead of 17). Genuine capacity leases call the private record begin path, while advance still delegates the actual prepass method. The test observation therefore moved to actual `advanceAutoGeneration` plus its current pending material. All **17** source identities, independent CPU masks, uploaded bytes, original promotion and no-extra-generation assertions remain. Counterfactual inputs/hashes and failure receipt are retained as `ls2-marker-counterfactual-sources.json` / `ls2-marker-counterfactual.log` under R52.

FOLLOW acquisition and consumption share one synchronous engine reservation, including the network await. The optional `onCanonicalIndexedReadIdle` notification releases only that read slot; it does not impersonate `onCanonicalAuthorIdle` or wait for a physically OPEN gesture to end. Busy acquisition never invokes the caller. Metadata handoff remains distinct from a source fault. Healthy normal-source retirement conservatively rechecks actual original suffix callbacks, then pure owner/cut/journal/generation/FIFO/local-receipt state before clearing recovery dirtiness. Partial cancellation never uses that path. No fabricated synchronous ACK/hold witness is claimed for the normal-finalizer guard.

Final post-review HOST gate: `ls2-engine-final-pending-leases.log` reports **163 tests / 5 suites PASS**, using the actual updated socket fixture that retains completed cursor A while finite candidate B is canceled. `ls2-engine-final-pending-leases-tsc.log` has zero diagnostics. No shared DIST rebuild was used.

A canceled partial FOLLOW retains its actual dense original suffix. Retry reasserts each fresh genuine delivery against that exact retained entry/input, complete normalized operation and source capability, then skips only its already-applied GPU/journal work. A changed same-sequence original is refused. The final ticket counts the whole actual suffix and folds the accepted OPEN carry once. A real preparation failure remains the primary error; GPU-poisoned owners are not made retryable. An actual delayed cancel ACK keeps the read reservation occupied until cleanup completes, including export and metadata handoff, before the dedicated read-idle notification.

Image source ownership has two distinct, witnessed cleanup boundaries. Local preparation publishes into a private caller-owned lease slot, so final-progress microtask cancellation releases the newly prepared root while preserving the previous selection. A same-key late subscriber acquires its own lease through at most one additional existing cache-hit preparation; no completed-job result is mistaken for owned residency. The Basic6 test warms the existing lookup before its CPU-baseline comparison, then proves cancellation returns to that baseline and a concurrent canceled/ready pair leaves a valid independent selection. During recorded FOLLOW, cancellation after source readiness releases only the exact unadopted `indexedSource.input`; Coordinator-adopted leases are not released twice. A genuine same-cut image retry subsequently draws and retains its OPEN source. All destroy checks return owned CPU reservations to zero. These are recording-GL lifecycle proofs, not device pixel or latency measurements.
