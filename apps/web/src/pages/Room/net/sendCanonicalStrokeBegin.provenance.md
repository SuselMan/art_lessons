# Captured canonical BEGIN request

sendCanonicalStrokeBegin is a single typed socket request beside sendOperation.
It owns only its timer and disconnect/abort subscriptions, with all-path cleanup,
no retries, queue, session, outbox or author clock. The caller must capture its
socket/room/user/layer/context lifetime in isCurrent and expected boardEpoch.
Request RGB and resource fields are copied before asynchronous ACK delivery.
Disconnect, abort, timeout, stale lifetime and emit failure reject; late ACKs are
inert. The real Room Socket satisfies the structural emitter type.

Only server ACK V2 capabilities are accepted. Exact request selectors, pigment,
resource opacity, alphaDarken, epoch and raster profile must match. Primary-only
procedural material binds descriptor SHA/ID/version and soft sourceSlot0; masks
and V1 snapshots remain unsupported. The existing shared material builder and
stroke decoder validate the full closed pin/context/budget and composition;
there is no replacement material parser. Accepted server data is deeply copied
and frozen, including radial source and coefficient arrays. No client descriptor
can grant a non-Over source; authoritative execution composition is checked by
the server before this ACK.

Tests exercise deferred ACK mutation isolation, failures/late ACK cleanup,
server refusals and corrupt selector/epoch/SHA/profile/radial/mask/version/cursor
capabilities. This emitter does not activate pointer painting or room readers.
Peer/cold historical capability delivery, recorded application, lifecycle,
undo/replay and active device QA remain separate open integration gates.

ACK verdict/snapshot own fields close before any deep copy. The original
material goes through the shared bounded validation first; only accepted data is
cloned. Invalid radial coefficient arrays and unknown snapshot/verdict fields
never reach structuredClone. Registration boundaries check synchronous close
reentry before registering further listeners/timers or emitting. Timeout is a
positive safe integer at most 2147483647, avoiding platform timer overflow.
Recorded-only resume may have recordedNext ahead of liveNext; the eight-frame
speculative live bound does not require those cursors to be equal.

## Captured expected whole-pipeline profile

CanonicalBeginLifetime now optionally pins rasterProfile. Omission/undefined keeps
old; unknown/null rejects before listeners/timer/emission. The scalar is captured
before asynchronous ACK, independently of later lifetime-object mutation. The
ACK snapshot must match it before material validation/clone; version1/2 probes
and decoder trusted policy are chosen from that captured value, not ACK content.
Only procedural SnapshotV2 admits the union; PNG SnapshotV1 remains refused.

Four-mode tests accept matching explicit V2 ACKs, reject those ACKs for default
callers, reject cross-profile/unknown/null data before clone and preserve request
shape, cleanup and cursor semantics. No event field, retry queue, UI/server
policy, source compiler or room grant is introduced by this helper migration.

BEGIN profile migration keeps the legacy rasterProfile singleton. New callers
can separately capture authorRasterProfile and explicit responseRasterProfiles
for verified old-prefix resume under a new author default. The known unique
1..2 response set is copied/frozen before emit with the shared helper; author
must belong to it. Legacy singleton combined with new policy fields is refused.
No ACK-selected profile outside captured policy, no timer/listener on invalid
policy; mutation of the caller's set cannot expand an in-flight request.

Material3 paired consumer adds explicit own-data materialVersion3 dispatch through
canonicalStrokeSnapshotV3; historical2 still uses its existing normalizer and
Snapshot1 remains refused. No ACK-selected inference or V2 projection. The
optional lifetime expectedDescriptorSha256 is captured before asynchronous work;
it is REQUIRED for3 and compared against the normalized immutable snapshot.
For2 it remains optional and, if supplied, exact. This scalar is local policy,
not a new BEGIN wire field. Request identity/RGB/composition, original scope,
captured profile allowlist, ACK cursors, timer/disconnect/abort semantics remain.
No source compiler/renderer/policy activation is introduced. New3 default callers
without captured descriptor pin cannot accept3; engine must explicitly supply it.
