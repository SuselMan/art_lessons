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
