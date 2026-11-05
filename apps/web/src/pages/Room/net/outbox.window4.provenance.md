# Same-gesture canonical window4 — 5 ноября 2026

The constructor's scheduling ceiling is2 by default and can explicitly opt into4.
Room opts into4. A third/fourth reservation requires that every existing attempt
is an actually emitted, unfaulted canonical frame of the SAME gesture; its
captured lineage must match the current original lineage after the existing
potentially reentrant getter. Legacy/control/mixed gestures and settling/retry
attempts keep the total2 boundary. Reserved slots never prove a successor emit.

Eligibility walks the contiguous actual-emission chain only up to the bounded
window. A missing ordinal, un-emitted predecessor, serial demotion or changed
lineage stops the walk. Close stays behind real frame ACKs. The same pending
entries, persistence and send callbacks remain the owners; frame bodies and
server admission are unchanged. No frame coalescing is performed.

101 tests/6 modules PASS: previous default-window2, canonical/control/legacy and
verdict checks plus opt-in4 held ACKs/close, missing ordinal/actual emit, mixed
and legacy limit2, permanent-fault serial drain, connection replacement, and
reentrant getter disposal/lineage replacement before a third reservation.
Strict3roots/327inputs/0 diagnostics; targeted lint0. Device measurement pending.
Baseline93b17f827 Linux100MOVE:178/203 operations, peak in-flight2, median
RTT44/51ms, wire span5.07/7.423s; measured after-lift Saved delay3.835/6.063s.
This is one physical AMD GPU with two contexts, not tablet/cross-device proof.
