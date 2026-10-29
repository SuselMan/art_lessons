# Closed-format canonical operation transport

This unit wires actual shared `CanonicalStrokeOperation`, authenticated
`canonical_stroke_begin`, `canonical_stroke_live`, and the existing acknowledged
`operation` channel to the concrete descriptor/CAS binder and frame admission.
There is no caller-provided resolver which quietly grants everything, no new
renderer/RNG/author execution, and no DB migration. Straight room creation/open
and the legacy web renderer remain CLOSED. Tests inject an authoritative
straight resident record only after normal legacy join; this is not a production
room-opening API. Numerical profile selection is the named server
`CANONICAL_ROOM_EXECUTION_POLICY`, not a frame claim.

## Authority and ordering

Begin uses the socket's authenticated principal and current pixel-owning board.
The binder validates runtime RGB8/outer opacity, explicit server alpha whitelist,
exact descriptor revision/source geometry and CAS. It prepares a grant without
publishing it. Successful brush pin precedes grant/session commit and the copied
data-only snapshot ack. A pin failure leaves no executable session. Later frame
colour, composition, numerical profile, source asset and static geometry must
match that pinned context. Begin retries preserve exactly the same grant.

All three canonical channels share a per-socket FIFO with at most 8 pending
commands. Overflow explicitly requests repair; it never silently skips a frame.
DB preflight does not reorder ordinal0/1. There are at most 4 asynchronous begin
loads process-wide, 64 resident room contexts, and 1024 pinned gestures. These
are explicit metadata bounds, not hard JS-heap guarantees or a second journal.

Live: prepare → immutable brush pin → admission commit → ack/peer relay; exact
live duplicates are not relayed. Recorded: authoritative duplicate-ID preflight
if the ID is absent from resident `operationsById`, then recheck the socket,
room/session/board+lesson identity and permissions. The synchronous critical
section is prepare → brush pin → existing recordOperation(server seq and existing
persistence queue) → admission commit → ack/broadcast. There is no await between
mutation and commit. Client user identity cannot replace the authenticated one;
new records cannot assign seq. Persisted same-ID/different room, user, timestamp,
layer or frame is rejected. An identical old retry returns its existing seq
without repinning, rerecording or relaying it.

Existing persistence remains fire-and-forget through the established queue;
this unit does not claim a new DB transaction durability guarantee. DB transport
failures preserve work with server_error. A recorded DTO is copied/decoded to a
frozen envelope before awaiting DB, so caller mutation cannot change the record
whose ID was checked.

## Prefix and lifetime repair

Unknown gestures drain the existing room write queue and query the authoritative
persisted canonical count for room + authenticated user + strokeId up to a pinned
seq watermark. A fresh begin requires count0 AND no contradictory resident
prefix. For an existing gesture, reuse the existing getOperationsBefore reader:
at most 64 recent room operations, 32 target frames, and 4 MiB serialized history.
Every target frame must be present, same identity, increasing seq and contiguous
ordinal/fences; the normal shared decoder/admission validates them. A bounded
read that misses a snapshot-covered prefix returns canonical_repair_required,
never a new ordinal0 grant. This intentionally does not implement an unbounded
full-history loader. The future ordinary repair reader must reconstruct longer
prefixes before enabling that continuation.

A validated reconstructed session advances both recorded and old-live cursors
without relay or a new DB write. Ack reports their next ordinals and whether the
gesture ended. Exact room AND lesson resident-object lifetimes are rechecked
after awaits. Replacement invalidates in-flight work and old grants, while a
socket reconnect to the same still-resident board can reuse its session. State
is not cleared merely because one of several sockets disconnects. Obsolete
lifetimes are reclaimed on subsequent canonical access; all retained metadata
is bounded. Epochs remain resident-lifetime identifiers, not durable DB epochs.

## Writer and checkpoint limitations

PM/unknown rooms reject canonical before pin/store/relay, including ID retries.
Old pixel writers in a straight room also reject before duplicate acknowledgement
or side effects. This temporary gate includes byte-neutral clear: it is not
intrinsically incompatible with straight pixels, but its serialization with an
active wash has not been integrated. Structural/meta operations retain existing
permissions. Blocking these scenarios is NOT a claim of complete straight-room
support.

Canonical frames are pixel writes in shared/web log metadata. All chunks of one
author's canonical frame.strokeId form one undo gesture, independently of legacy
stroke IDs. They are deliberately NOT added to generic snapshot coverability:
a wash frame may only be a preview backed by immutable original/local surfaces.
A future straight snapshot writer must use executor.checkpointReady/completed
fences and warm-prefix restoration, rather than treating each frame as an
independent stable prefix. Snapshot creation/opening is still legacy-only.

The future client drain must serialize/rebase ALL writes to an active wash
layer: A0/B0/A1 against A's immutable base would otherwise erase B. Server total
order does not perform this client rendering task. Teacher/owner intervention
still makes this necessary even on personal boards. Repair rejection is
transient; the existing outbox already bounds retries and retains stalled work,
rather than discarding it. No canonical author UI/outbox activation is added.

## Evidence

Actual Socket.IO tests use real binder, storage/CAS and room registry with a
mocked persistence boundary. They cover closed legacy formats, immutable begin
ack, live/recorded/durable retries, FIFO under delayed DB lookup, pin failure,
rights/lifetime changes after await, complete and missing persisted prefixes,
cross-room/user/frame ID collisions and bounded queue overflow. Independent
metadata tests cover pixel classification and canonical gesture undo/redo with
legacy and other-author controls. Existing room, socket, log and layer suites
remain regression gates. These are host/protocol tests, not GPU/native identity
or end-to-end straight-room rendering proof. Test sockets/servers and temporary
CAS directories are closed in cleanup; no persistent service/device is started.
