# DEV OFF asynchronous material scope backpressure

Default scope cap0 means OFF. Explicit finite0/2/4 is captured at material request
admission. Original quantum8 and4 ms CPU budget stay unchanged. The existing
controller forbids combining nonzero scope cap with quantum16/32 and records
selected/actual values. No automatic device policy or production query switch.

Backend pendingScopes already counts owner command scopes. Its original release
function is idempotent and is already called by the existing runQuantum queue
completion continuation on success or rejection. This patch only exposes a DEV
read-only owner-local snapshot (pending count/live), validating a nonnegative
integer count. The prepared material job's canStep closure remains bound to that
same backend and asserts unretired generation/live owner.

Before each original material step the FIFO generator reads readiness. At the
scope cap it yields its original -1 continuation until a later frame observes
existing release progress. No new Promise, completion callback, polling timer,
GPU query, fence, readback, pipeline, buffer or field. Source order, job steps,
finish, publication and operation history are unchanged. Missing readiness guard
fails closed. Cancellation still closes the original job once; late releases
update only their original backend scope owner.

This is a limit on admitting another material STEP, not a hard bound on every
native submission. Original source, job finish/dispose and bridge publication
can submit work outside it, and one step's cost varies. It may improve queue
pressure/rAF while increasing material/source wait. It is not a proven latency
fix and cannot make expensive compute faster. Default remains OFF; cap16 was
not useful and is not combined with this candidate.

CPU tests use actual backend.encodeOwnerCommands and adapter.runQuantum with
controlled ORIGINAL queue completions: ordered five material writes/source,
exact five submits and five original completion promises, cap2/4 waiting/recovery,
rejected completion release, cancel/device loss, owner destruction/retirement,
missing/invalid guard, no next source escaping the barrier. Existing original
rejection behavior is retained: release runs on queue rejection; this patch does
not silently invent a new GPU-error propagation contract. Parser guards and app
TypeScript pass. Actual same-packed GPU material equality and usefulness remain
OPEN, requiring a separately allocated bounded device run.
