# Actual Room canonical bootstrap

Room activates the original full-room-prefix-v2 path through its existing socket,
pendingSnapshotRef, engine effect, outbox and restore sink. No alternate engine,
queue, runtime or server policy is introduced.

The socket-owned typed joinRoom wrapper is published to useJoinGate. It captures
the requested board in the existing wantedBoardRef before emitting and advances
the existing readGeneration. The preparer receives expectedBoardId independently
of received state.room.id. Server currently seats exactly the requested board;
room_state is emitted before the join ACK, whose success only includes userId.
The client entryBoard rule may issue a second request for the teacher's active
board. This remains the same socket and typed wrapper. Legacy callers without
an injected preparer retain their previous behavior.

Straight engines require the original V2 read and exact tail before construction.
A fresh same-board full state stages the same pending slot and increments one
mount revision; publishing engineEpoch is not a mount dependency. An installed
read is only an identity/lifetime reference, not a second payload queue. The
existing openParkedRoomState consumes the original slot and passes it to the
same atomic baseline sink. Superseded canonical cleanup suppresses thumbnails.
Unexpected remount without a fresh original stash requests the existing resync.

Replacement never discards pending locals. Existing Outbox pending entries,
pending IDs, pointer activity and engine hasActiveCanonicalAuthor() protect the
BEGIN/CPU interval. Once these settle, the new original full cut must cover the
latest accepted ACK watermark before retirement. No local coordinator checkpoint
is mistaken for a durable journal cut.

The stable recorded facade calls engine.appendOriginalRecorded. The per-engine
BEGIN service reuses sendCanonicalStrokeBegin and combines original read, socket,
engine, caller signal/lifetime and captured author/response profile policy.
Successful operation ACK is bookkeeping (already handled by existing verdicts),
not a read grant or a reason to resync before the subsequent confirmed broadcast.
Reject/stall uses existing repair; ongoing replacement suppresses resync loops.

Host tests execute actual preparer, socket wrapper, join hook and state handler,
plus actual PencilEngine construction/restoration through the same pending stash.
They cover stale/copied read, same-board stage once, ACK ordering, pending local
and cut rejection, source begin abort/stale engine/socket with listener cleanup,
and ordinary legacy regressions. They are not device/UI performance proof.
No device, service or disposable runtime was created by this unit.

Validation: R52/canonical-room-controller-red.log records tests-first missing
controller; canonical-room-bootstrap-full-focused.log passes 120 tests / 8 files.
Scoped oxlint reports no errors (the existing mount effect dependency warning
remains); git diff --check passes. Common app/SW typing is coordinated separately
by ROOT. The new sink updates the existing applied IDs only after the original
baseline commit and same-engine/lifetime revalidation, including hidden metadata.

Pre-mount arrival race: canonical-pre-mount-gate-red.log reproduces an early
confirmed frame reaching the not-yet-mounted sink and invalidating the original
read through resync. Full V2 receipt now requires closing the EXISTING replay gate
before publication/rebind/ordered brush dispatch. The later restore begins a new
ticket on the same retained queue. canonical-pre-mount-gate-green.log passes
47 tests / 3 files, including actual ReplayGate + original ingress + OperationLog:
frame and close arrive before mount, baseline IDs are seeded before release,
the already-recorded frame is not appended twice and the close commits once.

Live non-frame/non-close operations under explicit canonical scope request the
existing full resync before review, held delivery or cursors. Tests-first
canonical-live-metadata-red.log captures four previous failures; the four-suite
canonical-live-metadata-green.log passes 54 tests. This does not grant live undo.

Cold/rejoin tool preparation: engineEpoch can publish before async full baseline
commit. useToolSync now receives existing roomContentReady; only straight engines
wait for that baseline gate. Its existing preparation key/effect retries the same
preset on readiness without a new epoch or reselection, and aborts superseded
preparation normally. Legacy readiness changes do not restart preparation.
canonical-tool-ready-red.log records premature source prepareBrush; the hook's
actual effects/dependencies under the ref/state model pass same-preset restore
and unchanged legacy behavior. canonical-tool-ready-green.log: 30 tests / 3 files,
scoped lint/diff checks pass. No new readiness event, scheduler or queue.

Final typing: app-only tsc passes (canonical-room-bootstrap-final-app-tsc.log,
exit 0); unchanged service-worker typing is covered by the previous coordinated
app/SW gate. Final 13-file regression initially hit two 5s host import timeouts
while TSC ran concurrently (175 assertions/cases passed). The identical source
rerun after TSC, maxWorkers=2 and host testTimeout=30000, passes all 177 tests in
15.21s: canonical-room-bootstrap-final-regression-30s.log. This timeout adjustment
is only test-run configuration, not a production latency limit or code change.

## Deferred fault repair

One current-engine/board control latch tracks restoring/ready/waiting/joining/
failed and whether repair was requested. It contains no operations, snapshot,
registry, timer or second queue. Fault requests arm before locking (locking can
reenter through the existing poison callback). Replacement waits for the existing
source hold API and Outbox/pending-id/pointer owners. Normal healthy pointercancel
does not arm repair: its original confirmed frame/seal path remains authoritative.

The same engine's existing poison callback arrives after source holds release;
canonical final settlement drains an already-armed request after the existing
ACK watermark update. Success ACK still never arms repair or paints. No React
pending-count effect drives repair: Outbox removes pending entries before async
storage deletion and onSettled. A source callback in that storage window may
request a join; its accepted write is already durable, the server returns a full
floor-zero original read, and replacement still checks its cut against every
known ACK. No duplicate settlement counter/ledger is introduced.

One join is sent per request. Restore failure stays failed until explicit retry;
failed UI readiness is not confused with active replacement. Retry retains and
retries the SAME Outbox; stalled pending entries block replacement and are never
discarded. Engine replacement/unmount detaches the old latch origin. Generic room
resync remains separate. The zero-emission source with no existing completion
wake stays explicitly fail-closed/manual-retry; no automatic progress is claimed
for that edge. Source callbacks from old engines/boards cannot repair a new one.

Deferred repair validation: canonical-recovery-regression.log passes 183 tests /
13 files (maxWorkers=2, host testTimeout=30000); scoped lint has no errors and
only the existing mount dependency warning. Coordinated app+SW 99580 passes the
frozen control with CPU/GPU author and healthy-pointercancel changes. The raw
confirmed-receiver admission-failure repair path is a separate follow-on seam.

## U2b: captured local control classification, commands still disabled

The optional engine-network classifier is created from `canonicalBootstrapOf`'s
ORIGINAL read and ORIGINAL tail, the captured socket, and the lexical constructed
engine. Its creation verifies the genuine read/tail and existing full-history
base. Each capture reasserts that original read, socket identity/connected state,
joined board, installed-read identity and constructed-engine identity. Callback
references are captured once. A fresh latest read never refreshes an old origin.
Copied reads/tails are rejected by the existing private original-read law.

Room supplies this callback for EVERY canonical bootstrap, rather than deciding
whether it is present from current connectivity. A stale/offline callback throws;
it cannot accidentally choose historical legacy behavior. Only emitted undo/redo
metadata consults it. Successful capture supplies U2a's local outer lane and
returns before touching applied IDs, pending-layer IDs or journal/snapshot
bookkeeping. Other operations and all legacy constructors retain their previous
behavior. No marker/context is added to operation JSON or the Socket.IO protocol.

No engine undo/redo command, UI action, healthy metadata replacement/rejoin or
fault workaround is enabled by this leaf. Server validation and subsequent
genuine full reads remain the only source of actual ordered history/visibility.
The generic recovery callback is not newly used as a metadata replacement owner.

Tests first RED5/prior49PASS, then55 focused tests pass. The integration witness
uses actual `prepareCanonicalRoomState`, actual canonical `PencilEngine` empty
baseline, the original bootstrap, the SAME Outbox and actual verdict reducer.
Manual callback invocation tests classification, **not** successful server undo:
a mocked ACK advances the watermark while the real journal/applied IDs remain
empty; replacing the actual engine or expiring the read prevents further send.
Negative tests cover copied tail/read, new installed read, board switch, replaced
socket, offline/not-joined origin and throwing classifier. Legacy metadata and
ordinary operations remain regression coverage. No fake original delivery or
private raster-version mutation is used.

Targeted TypeScript includes Room/index.tsx and both owned source/test pairs under
the actual web app options/globals (R52/outbox-control-u2b.tsconfig.json): PASS.
Scoped lint:0 errors, one preexisting mount-effect dependency warning. Diffcheck
PASS. Coordinated full-app verification remains parent-owned. No browser/device,
service, dependency copy or long-lived process was created; compact ignored host
logs/config are retained in R52.

## U3a: nonactivated healthy metadata interval in SAME Origin

This leaf adds no Room/confirmed-stream consumer or engine command activation.
The existing control Origin alone retains a healthy interval: genuine original
read/tail, a frozen socket/connection/board/read lineage, at most one bounded
captured local metadata request, an internal receipt and a durable lower bound.
No operation list, pending registry, replacement engine, timer or dispatch queue.

`beginControl` validates the full original bootstrap and current origin, refuses
active/pending local work, and arms command busy without a cut, lock, UI failure,
read invalidation or resync. A copied/stale original cannot arm it. The returned
opaque token is only for lexical enqueue-rejection rollback. `cancelControl`
requires exact token identity and an unplaced interval and never clears Outbox
work. Fixed `settleControl(op,result,context)` finds the receipt INTERNALLY in the
SAME Origin, matching all captured request scalars, exact current engine and the
Attempt's captured lineage; no Room activeControlRef/map or token forwarding is
needed. Missing lineage/hydrated/stale entries cannot create a fresh origin.

Only an actual durable ACK sequence or closed confirmed undo/redo metadata can
supply the lower cut. A successful notification closes the SAME replay gate once
and records the durable watermark through paired callbacks. It does not append,
paint, advance lastConfirmed, observe review state or fabricate recorded inputs.
Duplicate ACK/confirmed deliveries share the interval and one actual resync.
ACK without broadcast is sufficient; busy survives removal of the Outbox entry.
A permanent unplaced rejection terminates the failed interval and resets this
same origin ready/history-empty, without lock/resync; paired UI can report the
actual rejection and allow another command. An independently confirmed peer cut
is retained and drained even if the local command was rejected.

Healthy waiting deliberately does NOT use fault `request`/`retired`, early
`setLocked`, source cancellation or fault onWaiting. The separate
`onHistoryJoining` notification occurs only after actual idle locking, so paired
UI need not show a transfer error for a healthy join. Drain waits real source
holds0 and SAME pending/outbox0. `authorIdle(engine,board)` is an explicit current
origin wake; the paired engine callback must run after full source cleanup,
partial-close emission and fault drain, not immediately at the counter decrement.
No normal author-idle callback is wired in this leaf.

Final idle observations follow potentially reentrant lineage/canRequest/current
callbacks. The last author observation is immediately followed by locking the
idle engine, BEFORE the joining UI callback. Post-callback owner/interval/idle
checks precede actual resync. Joining is accepted only when synchronous resync
really invalidated the original read and the same Origin survived. Exceptions,
no invalidation and stale/reentrant owners cannot publish joining. Healthy
intervals never attest physical retirement to whenRetiredTransition. Retry uses
a fresh interval, preserving a real durable cut when one exists; an unplaced
failed command is not converted into a synthetic fault/resync.

Tests-first RED4/prior40PASS. A separate real-engine lock-order witness captured
RED1/prior53PASS: the old UI-before-lock order actually started BEGIN. Its positive
control uses a prepared native Basic2 source and the same real pointer callback;
the corrected order blocks joining-time DOWN without author cancellation/poison.
Additional callback witnesses start a source from canRequest/lineage and leave
healthy waiting unlocked. Final **79 tests / two suites PASS**, maxWorkers1,
including all40 previous controller/rendezvous tests and19 Outbox verdict tests.
The fixed SAME Outbox callback integration needs no external control receipt ref.
Targeted actual-app-options TypeScript, scoped lint and diffcheck PASS (R52
healthy-control-u3a-*). No full-app/GPU/physical DB/interactive undo claim.

Actual OPEN local CPU/raw work + held originals + all ACKs + verified complete
full replacement is REQUIRED in U1/U3b before activation. A numeric cut alone is
not full-prefix evidence. No Room, engine/index, shared, server or runtime resource
changed here; compact ignored logs/config remain, no live process/service/device.

Healthy transition rendezvous: `whenHistoryTransition(engine,board)` observes only
an existing durable healthy interval (real cut + replay hold). It lazily shares
SAME interval.barrier/promise and settles joining only after actual invalidation;
bind/detach/failure settle stale/failed normally. An armed but unplaced command
cannot create the barrier. No-observer work still completes. Physical-retirement
observation remains separate and returns failed for a healthy interval. Tests
first RED2/prior58PASS then final79/2PASS include shared wait, active/ACK ordering,
detach and throwing resync. The future Room hold callback can retain its ticket
lexically in the shared promise continuation, without an active-ticket registry.

## U3b: paired healthy history ingress and actual U1 consumer

The constructed Room callback arms the SAME Origin before enqueueing the exact
U1 metadata candidate with the existing local-only Outbox classification. Its
receipt is retained only by that enqueue rejection continuation. There is no
Room command map/ref, optimistic metadata append, ACK paint, pending-ID clear,
physical-retirement witness or fabricated END. Current offline/busy callbacks
refuse a new command. Permanent undurable rejection uses the existing toast.

Current original-scoped undo/redo confirmations are closed metadata, not new
CanonicalRecordedInput grants. Pure preflight captures the same payload/private
proof; replay keeps its exact original lifetime. The handler invokes the healthy
owner before review/cursor/snapshot effects. Metadata already represented by the
full baseline cursor is ignored. A gap requests a genuine complete cut bounded
by actual placement rather than inventing missing frames. Frames/seals retain
original recorded delivery and the existing ordered resource gate.

The replay ticket is lexical to the SAME Origin history-transition promise.
Joining settles only after the actual socket resync invalidates the old read;
then releasing held old originals cannot promote an obsolete journal. A new
room-state scope arriving before engine mounting keeps frame AND metadata
suffixes held until the new associated engine is installed. Legacy operations
retain their old engine-replacement behavior. Original-tail parameter/storage types are readonly without a runtime copy.
The final architecture-map review additionally required extracting the new
healthy-control algorithms from Room into this existing controller module.

Actual host integration uses the real source compiler/BEGIN snapshot, pointer
callbacks, engine, original Room preparer, SAME socket ordered/replay gate and
SAME Outbox with independently resolved durable ACKs. It first authors/promotes
an ended gesture, starts another OPEN gesture, receives metadata ahead of its
original confirmations, emits MORE THAN EIGHT subsequent packets, then finishes
ordinary UP. Source CPU/holds drain while original receipts remain held and the
old journal/cursor stay unchanged. All actual ACKs settle independently; only
then the healthy transition requests and restores a genuine full prefix,
including the metadata and all emitted frames. Original inputs/server sequence
are retained, hidden gesture state is verified, no fault/legacy confirmation
runs, and destroyed owners return charged CPU to zero. The second actual engine
uses the genuine author service too: its U1 undo goes through marked Outbox;
ACK without any broadcast starts another full join and duplicate invocation is
blocked without mutating the journal. This is HOST/mock-GL evidence, not native
pixels, physical DB durability or interactive browser acceptance.

Initial paired run: **128 tests / four suites PASS**, one worker (controller,
confirmed source ingress, Room socket integration, actual U1 engine). Targeted
actual-app-options TypeScript PASS. Scoped lint has zero errors; the existing
mount-effect dependency warning is retained. The fresh-scope test was then
extended to assert metadata as well as frame suffix delivery; its separate
result is recorded in ignored R52 healthy-control-u3b-fresh-history.log.

Concurrent O2 resource WIP was isolated honestly in that HOST run by a Vitest
in-memory loader reading ONLY TransformedMaskPrepass.ts, BrushGlBatch.ts and
BrushTextureCache.ts from reviewed dd763a6a695ad8746e472e508be4d7317857f076.
All U1/Room/controller sources and tests were current; no disk source replacement,
relaxed assertion or production bypass. Captured source hashes are retained in
R52/u3b-pinned-resource-overlay-result.json. A joined run with the final actual O2
sources is REQUIRED before paired commit/activation; no full-graph or GPU PASS
is claimed by this intermediate receipt. No runtime/device/service was started;
only compact ignored diagnostics/configs remain.


Final map-budget correction: Room grew to 1974 lines against its unchanged1915
budget. Healthy verdict routing, exact-candidate submission/rollback, captured
lineage, lexical replay-ticket rendezvous, request eligibility and the ref-to-
lifecycle adaptation were extracted into this SAME controller. Room now has1914
lines; comments were retained and the budget was not raised. Controller helpers
receive observations and UI notifications explicitly and import no UI store.
They reuse the same Origin, Outbox, gate, original read/tail and callbacks, with
no additional command state, registry, queue, timer or authority. The original
socket preparation wrapper was also moved unchanged into this module. Scope is
now ten owned files: the previous nine plus existing controller.test.ts; the
controller.ts exception now includes these runtime helpers rather than only
readonly types.

Three meaningful helper tests cover exact candidate/legacy routing, undurable
enqueue rollback and duplicate blocking, marked rejected/stalled control versus
source faults, and Room-ref adaptation through active waiting to actual original
read invalidation before lexical gate release. Controller63PASS includes these
three. Final current-source paired and map/type receipts are recorded in R52
healthy-control-u3b-refactor-* (no foreign-resource loader in this final run).

Final joined HOST receipt: **131 tests / four suites PASS** on the actual current
resource sources (default Vitest, no overlay). After correcting the helper's
legacy fixture discriminator from invalid `clear` to actual `layer_clear`, the
three extracted-helper tests PASS again. Final targeted actual-app TypeScript
session5594 exit0 includes existing controller.test.ts plus Room/net roots.
Scoped lint0errors/one retained mount-dependency warning; map:check PASS with
Room1914/1915, map:rules PASS0errors/24knownwarnings/11ignored, diffcheck PASS.
No source runtime, device, service, database or browser process was started by
this unit. Frozen scope10 is awaiting ROOT's atomic paired16 commit (U1six plus
these ten); there is no standalone U1 activation commit or push.

## Indexed U3 connection binding

Healthy history now captures a tagged full original read/tail or the authenticated
`CanonicalIndexedSocketOrigin`. The indexed branch requires the original parent
scope and board; finite page/cursor cancellation does not retire that parent.
The full branch retains its private read validator and original full-history
base/tail assertion. Neither branch fabricates a baseline or transfers authority
from an ACK/cut. Outbox lineage retains that same connection origin.

`beginControl` accepts the connection metadata interface and an undefined tail
for an indexed parent. The existing receipt, durable sequence latch, body equality,
Outbox ACK handling, pending/source drain and recovery interval remain shared.
`confirmedIndexedControl` accepts only the exact original `CanonicalRecordedInput`
with the same captured lifetime, no recorded source attachment, a closed undo/redo
schema and positive durable sequence. It requires no released page payload.
The lifecycle exposes `confirmedIndexed(input, origin, engine)`; its indexed local
operation handler uses the existing canonical control lane and enqueue rollback.
No indexed source error or healthy history event mints physical retirement.

Host controller tests cover released page/cancelled cursor input, copied origin
and input, wrong lifetime/board/cursor, stale connection and engine, receipt failure,
ACK before metadata, durable watermark maximum, duplicate metadata, and the same
Room lifecycle's single replay ticket released only after actual resync invalidates
the parent. These tests use authenticated socket-fixture origins and controlled
ACKs. They do not attest real database durability, actual engine target selection,
GPU pixels or device performance; those remain paired integration gates. The
feature remains inactive until ROOT wires and verifies the complete pair.
