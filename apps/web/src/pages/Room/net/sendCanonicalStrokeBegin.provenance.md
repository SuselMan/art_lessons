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
