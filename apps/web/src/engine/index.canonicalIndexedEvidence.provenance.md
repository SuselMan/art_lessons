# One genuine indexed evidence lookahead

Initial indexed restoration can overlap ONE actual root-evidence request with
execution of the current original prefix. The earliest unknown frame-zero root
is selected only from the SAME retained page (already bounded to 64 originals).
Scanning stops at metadata, close or unsupported layer/prefix. No second page,
wire queue, parallel read request, source admission or author capability is added.
Recovery, suffix replay, FOLLOW and local authoring do not use the lookahead.

The genuine client API already binds evidence to the exact delivered input and
serializes all read/evidence requests with one busy slot; the server does likewise.
The current prefix can continue GPU/CPU work while that slot awaits its ACK.
At the target's normal ordered root admission, the engine adopts the SAME proof
and runs the unchanged witness/visibility/source checks. If the ACK is pending,
the candidate parks until that SAME result arrives; it never requests it twice.
The page cannot be released or advanced with a lookahead still owned.

One owned metadata reservation (512 bytes plus the actual UTF-16 key length) is
released on adoption or cancellation.
If that optional reservation cannot fit the current CPU budget, lookahead is
skipped and ordinary ordered admission remains available. A fitting slot still
adds that bounded overhead to the live peak; this is not a promise that later
mandatory workspace allocations cannot reach the unchanged overall CPU cap. The result holds only
the existing bounded root proof; no history-wide root collection is introduced.

The module-level Promise observer captures only a detachable outcome cell. The
job notification is cleared before candidate cancellation releases the page or
cancels the read. An already-fulfilled proof is released before its reservation;
a late fulfilled proof is released directly, and late rejection is observed.
Unexpected late cleanup failure is retained only as a scalar message capped at 256 characters on the
outcome cell, not silently discarded. The current genuine client's proof.release
checks its receiver and clears metadata references; the correct receiver does
not invoke arbitrary cleanup. The active notification catches ownership/schedule
errors into the existing candidate failure path, whose cleanup actions are guarded
and whose rejection callback is the native Promise reject.

The existing async rootEvidence API itself necessarily retains its genuine input
until the ACK to validate origin and mint its exact proof. This unit changes no
such API contract; it prevents a NEW observer from retaining the engine, job or
page after cancellation. It does not claim all wire-level input retention ends
before ACK.

Tests execute actual socket-ingress busy gates, page/evidence/cut issuers and the
real engine/coordinator/mask/deposition services. With the next root's actual ACK
held, current prefix pixel execution continues, the engine parks at that root,
no extra next-page request reaches the wire, and no cut is published. Releasing
the ACK admits exactly its original result with no duplicate evidence RPC; the
actual empty terminal ACK remains required. Additional cases exercise pending
cancellation followed by late fulfill/reject, already-fulfilled proof cancellation,
ordered failure, stale origin and prefetched hidden-root witnesses without source
painting. All destruction checks include zero retained CPU reservation.

The exact d06ea8036 production index overlay fails the overlap regression:
actual draw count remains 5 after evidence starts (5 is not greater than 5).
Current source passes. Runtime source is overlaid only by the test loader; working
production files are not replaced. Compact logs/configs and the source freeze
manifest are in fixes-v52/evidence-lookahead-*.

recordingGL does not rasterize pixels. No measured Samsung speedup, exact GPU
pixels or physical pen latency is claimed by these tests. Those remain ROOT gates
on an immutable build using the genuine long S4 history.
