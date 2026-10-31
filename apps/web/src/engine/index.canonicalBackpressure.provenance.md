# Confirmed ingress capacity: same-owner backpressure

Actual Samsung hot-peer z8 established a gap-free seq1..177 wire stream and a
primary `Canonical wash lane queue is full` failure. Durable cold replay was
coherent; the prior server-broadcast-order hypothesis was withdrawn. Frames
arrived faster than bounded GPU deposition could drain the existing eight-frame
lane. This unit changes coordinator/index production only, their existing
recorded/image-preparation tests, the existing roomSocket test and this record.
No max8/maxGestures/CPU/GPU quota, ACK semantics, source selection, profile,
server transport, Room API, scheduler or render pipeline is replaced.

Coordinator canAcceptRecorded reads actual existing lane/executor counts under
original delivery/lifetime/layer guards. It is capacity only, not a reservation
or permission. Local original promotion needs no GPU slot; a close already
represented in the lane needs no additional slot. Full enqueue validity and
journal/source checks remain independent and strict.

prepareOriginalRecorded now checks capacity before EVERY ready path, including
auto, matching image sources and typed close. The existing ordered gate keeps
the exact head original and its lexical final closure. No engine pending-input
queue is added. A single ephemeral promise/resolve on the SAME layer owner
signals progress and holds no frame/source/input reference. Its bounded256-byte
metadata reservation uses the existing CPU owner. Actual frame removal wakes
waiters; they recheck the original and current layer before reporting ready.
Retirement/loss/destroy resolves the barrier after attempts to retire resource
owners; failure remains failure rather than a new ready grant. No timer/END/
checkpoint wait, second scheduler or long-lived GL borrow is introduced.

The order-park deadlock is independently reproduced: genuine4x4 raw wash with
1x1 composite parts produces a real partial stable commit; unknown local A plus
seven B frames fills the lane, while B's next original precedes A's original.
Old advance loops1000 times without freeing a slot. Stable-order blocking is
now separate from execution parking: queued RAW deposition can progress, but no
stable commit/rebase/presentation is performed while order is unresolved. Only
an empty raw queue parks the same job. A need not END before B progresses.

Critically, the SAME partial commit targetPlan stays OPEN. Resident admission
in TiledLayerBuffer.preparePaintTargetRects shares the existing retained entry's
storagePins when buffer identity/current ledger match. New executor physical
plans do not unpin or replace the partial buffer. The test keeps the original
plan and committingBuffer identities, takes the same resident buffer, observes
clear refusal while retained, and verifies unchanged commit part/no stable-over
draw until order becomes known. If a current commit plan still owns missing
storage, only that SAME plan may materialize one target in a captured turn;
raw work yields until the next turn. Existing lease/geometry/epoch checks stay
strict. Resume retains the exact partially committed buffer check.

Tests first: backpressure-partial-red.log proves the queue8 deadlock. The full
coordinator test later admits B head and A's real local end/original receipt,
then reaches checkpoint without fabricated END. The actual engine test uses
native Basic2 A genuinely down, all163 original Basic6 B frames and the SAME
orderedBrushGate. It retains original input identities and strict seq order,
observes queue maximum8, preserves active A/program/bank, then continues A and
finishes at a healthy checkpoint. The image test harness needed bufferSubData
for its newly reached nonempty image prepass; this is not production behavior.

Cancellation tests cover an already-blocked ninth original across abort,
destroy, real loss handling and stale source lifetime: ninth is never journaled,
the barrier retires, final CPU is zero. The socket test combines actual replay
handoff, an asynchronous ninth preparation, later frame/close items and a
reentrant14th arrival; final applies remain1..14 and durable-knowledge metadata
does not advance the confirmed cursor while waiting.

Host recordings prove calls/ownership/liveness, not GPU pixel equivalence or a
latency bound. Runtime/lint/type receipts: R52/backpressure-*.log. Root owns the
paired Samsung hot-peer and cold replay proof. No shared/dist build, services,
device work or temporary runtime resource is created by this unit.
