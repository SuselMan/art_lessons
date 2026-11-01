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
