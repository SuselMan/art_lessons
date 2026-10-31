# Retired canonical recovery rendezvous

First internal leaf only; no Room/socket/index wiring and no standalone commit
until the genuine paired consumer proof. This extends the existing RecoveryControl
Origin rather than adding an operation queue, registry, source/read factory or
network authority. Existing request/drain/legacy callers remain available.

The new internal retired(engine,board) witness may be called only by the exact
constructed-engine fault callback AFTER that engine has retired physical resources
and CPU/FIFO holds. Arbitrary missing-CAS/budget/preparation exceptions may not
claim this witness. This module alone cannot prove that its internal caller obeys
the contract; the actual paired engine/Outbox/ingress test is a required next gate.

whenRetiredTransition observes the SAME Origin and its current observation
interval. No observer means no pending Promise/barrier. Concurrent pending
observers share one lazily allocated Promise; they keep no work/subscriber alive.
Results are joining/stale/failed, never a paint/read/source grant. Joining is
settled only AFTER resync returns successfully and exact Origin/interval/engine/
board is still current; the resync owner must synchronously invalidate the
original read before returning. A provisional joining phase is not sufficient.
Detach/rebind settles old observers stale; failure settles failed. Retry replaces
only the observation interval, clearing its retirement witness and old settled
outcome. Rebinding the same engine/board cannot refresh a failed witness.

All pending checks stay intact: actual source holds, pending local work, connection
readiness. The controller neither clears them nor cancels/replaces the brush gate,
invalidates an original read itself, fabricates END/receipts or skips an item.
The future consumer must retain the head until the actual joining invalidation;
the still-active existing gate can then drop stale original-generation items and
accept the new authoritative room_state. Healthy errors need a separate policy.

Tests-first: R52/retired-recovery-controller-red.log:11 new failures,16 old PASS.
Focused final log retired-recovery-controller-final.log covers lazy shared wait,
no-observer operation, source/pending/connection blocking, failed lock/resync,
reentrant bind/detach/failure/retry, waiter first created inside resync, stale board,
and same-owner rebinding without witness refresh. The existing fixture is a
controller mock; no physical GPU, database or network durability claim follows.
No services, devices, temporary processes or runtime resources were created.

## Paired consumer

The paired Room callback now observes only the captured constructed engine's
retirement witness. It retains the original recorded input and scope across
preparation, checks engine/board identity after every await, and returns typed
ready/obsolete. Only explicit cancelled preparation retries through the existing
finite preparation owner; exceptions do not retry. The socket captures an existing
engine at wire arrival before CAS awaits and again after synchronous replay hold.
An obsolete result cannot apply in a still-current generation. Neither layer
cancels the existing brush gate nor invalidates the read before actual joining.

The actual host integration uses prepareCanonicalRoomState, original native
Basic2 pointer output, real Outbox persistence/ACK settlement, real engine context
loss retirement and the SAME ordered ingress gate. It proves CPU/source holds
reach zero before delayed last persistence deletion permits resync; ACK publishes
only the durable watermark. The original confirmation head never paints or
advances cursors after loss. The same gate then accepts a fresh full room_state
and a new actual engine restores its original inputs. A second actual-engine test
replaces remote preparation with UI preparation once, observes cancelled then
ready, and verifies the original open author can still emit. The peer Basic6
packet is its original first packet: this is ownership/ordering evidence, not a
nonempty image rendering or GPU pixel proof. No physical DB or online durability
is claimed by mocked persistence/GL.

Final runtime verification: paired-resource-consumer-final-tests-2.log, 94 tests
in four suites PASS with one worker; scoped lint and diff checks PASS. The old
actual-constructor dynamic-import test has a 15-second timeout because initial
module transformation exceeded its former 5 seconds under the combined run;
the first timeout log is retained. Targeted TypeScript uses the actual app config
and five owned source/test roots, adding installed Node ambient types only in the
R52 diagnostic config for static crypto/zlib imports and Buffer. This does not
change application compiler options or suppress source checking. Full combined
application/SW verification remains a separate coordinated gate.

Post-review legacy boundary: wire-arrival engine identity is pinned only for
canonical_stroke/canonical_stroke_close, not ordinary operations merely because
the optional canonical callback is installed. The new legacy-pm8 room test holds
an actual brush-preparation Promise, replaces the engine on the same board/read,
and verifies the queued ordinary streamed stroke still applies and synchronizes.
The canonical CAS-await replacement regression continues to drop its old item.
The first test captured zero legacy sink calls before this narrowing (retained
paired-legacy-engine-red.log); later fixture assertions were aligned with the
existing streamed-stroke branch, which delegates applied-ID ownership to its sink.
Final paired-resource-consumer-final-tests-5.log covers 95 tests in four suites.
