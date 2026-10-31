# Closed recorded read attachment (inactive)

The batch-local capability dictionary carries existing V2 server snapshots plus
original author identity. Every binding names exact authoritative operation ID,
seq and original user. prepareCanonicalRecordedAttachment validates the WHOLE
same delivered operation array before returning immutable per-operation atoms.
No registry, queue, source compiler, append grant or active protocol is created.
Indexes are serialization-local; returned atoms share a frozen capability object
and never retain dictionary index authority.

Own fields and array/string shapes close before deeper work. Material/source,
profile, budget, pigment and composition validation reuse the existing shared
material builder and stroke decoder. Only reconstructed validated bounded fields
are serialized for UTF8 sizing; unknown raw objects and operations are not
stringified/cloned. Limits:64 unique caps,1024 delivered ops/bindings,256KiB/cap,
4MiB/attachment. Network JSON has already been parsed (existing Socket.IO20MiB
limit); this is not a preparse cap or authority attestation.

Every canonical op has exactly one ordered binding, all caps are used in first
occurrence order, duplicate original-user/stroke caps reject even if equal,
seqs strictly increase, and descriptor/source/role/profile resources must match.
Different original users may reuse stroke IDs. Legacy operation schema remains
its existing delivery owner's responsibility. Canonical operations are projected
and frozen without changing opaque material bytes or IDs/seqs.

Caller must establish authoritative server delivery/read permission and captured
room lifetime. Retained history integration is deliberately absent: future
LogEntry metadata may own the accepted plain capability reference, while GPU
source/program owners remain separate existing context resources. Review-store,
replay gate, cursor and log mutation must happen only AFTER whole-atom validation.
Room/engine guards and protocol payloads remain unchanged/OFF.

Tests cover identity/resource corruption, mixed legacy/canonical atoms, two
users reusing a stroke, exact closure/order/unused refs, no unbounded stringify/
clone on rejected shapes, real UTF8 cap and aggregate byte limits, and immutable
shared per-operation preparation. No physical DB/device correctness is claimed.

## Captured profile migration

Existing procedural SnapshotV2 now carries the old/new whole-pipeline profile
union; PNG SnapshotV1 keeps its old literal. The receiver's captured
CanonicalRecordedReadScope has an optional rasterProfile: only undefined defaults
to old. Unknown/null policy rejects before walking attachment data. A snapshot
must match that captured policy; neither a frame nor snapshot selects authority.
Probe versions1/2 are chosen from captured old/new policy and passed explicitly
into the same decoder's trusted context.

Every prepared internal read atom retains required rasterProfile from that scope,
including explicit old when the caller omitted it. This is metadata for repeated
OperationLog validation, not a new wire attachment field or append permission.
Snapshot/operation/material bytes are otherwise projected through the same
bounded closed validator. Tests cover four modes, cross-profile refusal,
immutable output and unknown/null early refusal. Default callers remain closed.
