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

Read profile migration: optional captured allowedRasterProfiles is bounded to
1..2 unique known profiles and copied/frozen by canonicalRecordedRasterProfiles.
It cannot coexist with the legacy singleton selector. Omission preserves old.
Each snapshot must belong to that trusted receiver set; each frame decodes
against its exact bound snapshot profile, not a global batch profile. Mixed
old/new gestures are allowed only with explicit captured policy; one gesture
cannot change profile. Existing wire dictionary/schema and byte limits remain.


## Explicit primary texture server/recorded consumer (activation OFF)

Actual snapshot/attachment types explicitly include material3 beside historical1/2.
Attachment outer version1 remains the same bounded dictionary/binding table; its
snapshot materialVersion2|3 is an explicit discriminator, NOT old-parser
compatibility. Own DATA materialVersion selects existing frozen SnapshotV3 parser;
no inherited/accessor selection or downgrade. Pure decodeCanonicalRecordedSnapshotFrame
always supplies top-level selector3 for a normalized3 snapshot. Attachment,
empty/full history and indexed root terminal dispatch reuse it. Global codec
Any unions remain1/2; no decoded source authority is minted by this pure helper.
Old SnapshotV2 parser body remains unchanged. Byte/count/profile/first-use/index
limits count BOTH image and pattern assets without cap increases. Actual network
origin/read factories remain the only original-delivery provenance owners.
New shared tests are structural metadata/original-table fixtures, not a native
Chalk35/CAS/renderer proof. Original source authenticity is verified by server.


### Explicit CMAT3 server/shared boundary: final source freeze

The opt-in primary-texture policy defaults OFF. Attachment version remains 1;
snapshot materialVersion is explicitly 2 or 3. Global legacy codec Any unions
remain closed to 1/2. No runtime, policy activation, shared/dist emission, or
compatibility claim for old protocol clients is included here. Real Socket.IO
coverage verifies the global protocol barrier before identity/load/seat work.

Source-alias final focused run: **170 tests / 8 suites PASS**, one worker
(`texture-server-final.log`). Full server SOURCE TypeScript and targeted shared
test TypeScript both exit 0. Scoped oxlint exits 0 with warnings, no errors;
scoped diff check passes. Semantic baseline pins the nine production files to
ba4ad547 and gives three expected failures (old parser/binder refusal). The
prior broad 230-test run had 229 passes and one diagnostic-string regression;
the old OFF-policy diagnostic was restored and its resolver suite passes in
the final joined run. This does not relabel that earlier run as all green.

Fixtures prove structural policy/CAS/packing/close behavior; they are not a
claim of native Chalk pixel identity or a live V3 grant. Genuine reimport and
actual author evidence remain separate QA artifacts. No temporary service,
browser, database resource, or persistent process was created by this unit.


### Review follow-up: Snapshot3 profile accessor boundary

Independent review found rasterProfile was read before explicit3 strict capture.
A real prepareAttachment3 accessor fixture is semantic RED (getter invoked),
then GREEN with zero getter calls. Explicit3 now checks own DATA materialVersion
and rasterProfile before strict snapshot capture; legacy2 profile policy remains
unchanged. Postfix attachment/base/page 72/4 PASS, targeted shared tests TS0,
scoped lint0 and diff-check0. Prior 170/8 source run precedes this narrow fix.
No runtime/dist/activation change.
