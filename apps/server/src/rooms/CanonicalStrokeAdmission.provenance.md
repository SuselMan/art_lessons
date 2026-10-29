# Closed canonical admission prerequisite

This service is deliberately NOT registered on a socket event, added to the
shared Operation union or installed as an authorization policy. Current
`roomRasterAdmission` admits legacy PM rooms only. `sourceStamp` is retained
source data, explicitly not renderer capability. Current brush pin/context
helpers inspect legacy `type:'stroke'`; using them as canonical authority would
be fictitious authorization.

## Trust and lifetime

The resolver is an explicit server-owned dependency. Its result must bind the
pixel-owning board (not its lesson), authenticated user, writable layer, board
revision, pinned descriptor SHA/preset, straight room encoding, the shared
canonical fused profile, immutable pigment/composition and verified CAS/material
budgets/preflight. Profile names, descriptor presence or client source metadata
alone never authorize a frame. No resolver implementation/straight activation
is supplied here.

The service admits only exact discriminated `canonical_stroke` (id/layer/frame)
or `canonical_stroke_live` (layer/frame) candidates. Client identity, seq, dabs,
random/options or unknown extra fields cannot accompany them. Shared envelope
and material decoders check fixed context, packed bytes, CAS and geometry/cost.
Cross-frame phase/group/ordinal continuity is checked separately before a ticket
is exposed. Only single-primary/unmasked executor material is admitted.

One immutable gesture context spans live and recorded lanes. Early live and later
recorded delivery share SHA256 fingerprints so the same material does not advance
fence state twice. Live may lead by at most the configured <=8 retained frames.
At most8 committed fingerprints plus8 speculative live fingerprints are retained.
Authoritative records may progress without live traffic; old live retransmissions
outside the bounded committed fingerprint window require receiver resync. Exact
live duplicates must not be relayed/painted again. A recorded duplicate is first
handled by the existing durable operation-ID lookup.

Gesture count is explicitly bounded (<=1024, caller chooses its lower resident
room allowance). Completed states are not silently evicted into reusable IDs.
`clearRoom` is only for a room lifetime boundary AFTER authoritative canonical
history can reconstruct its admission cursor and durable gesture reuse rules.
No cold-history reconstruction/automatic expiration is invented in this unit.

## Future concrete socket ordering

Use authenticated `socket.data` board/user, never payload userId. The future
adapter must preserve the current single-threaded no-await critical section:

1. Recorded retries: existing durable operation-ID lookup, checking the existing
   canonical record matches identity/content rather than acknowledging arbitrary
   ID collisions. Existing PM records retain their old behavior.
2. Reuse current classroom/freeze/lock/deleted-target permissions with a real
   canonical operation capability. Extending the Operation union must extend
   painted-layer/structural/replay/history/snapshot consumers together; do not
   forge a fake legacy brush authority.
3. `prepare` performs complete trusted/material/continuity admission, no pin,
   mutation, relay or persistence. A failed pin leaves the ticket uncommitted.
4. Recorded: pin -> `recordOperation` assigns seq -> ticket.commit -> ack/confirm.
   Live: pin -> ticket.commit -> relay, suppress exact duplicate tickets.
   Commit must precede transport emission, so a relay failure cannot rewind an
   already accepted authoritative record. No awaits or reentrant admission
   between prepare/effects/commit. Revision guards reject stale tickets.
5. Room eviction/reconnect/cold load must rehydrate committed gesture cursors and
   policy epochs from trusted history before enabling new admission. Permission
   revocation/profile migration must invalidate prepared tickets in the same
   serialized lifetime. DB persistence retains existing operationLog semantics;
   this service is not a new transaction or seq generator.

Runtime default now fails closed: an exhaustive server Record against all current
`Operation['type']` discriminants rejects unknown/reserved canonical types before
owner exemptions, pin, relay or store. Legacy stroke fields/codecs remain valid.
The legitimate `shape.frame` field is preserved; canonical frame/profile/material
fields cannot ride legacy stroke/live packets to bypass their closed path. This
is a discriminant/mixed-format guard, not a claim to validate all existing
operation field schemas.

## Verification boundary

Focused tests cover abandoned prepares, immutable grants, CAS/byte budgets,
live/recorded order, hash conflicts, ordinal/phase gaps, bounded lead/lifetime,
stale tickets, authenticated scope isolation, and ID reuse. Actual Socket.IO
harness proves unknown/canonical legacy-channel payloads cause no BrushStorage.pin,
operation persistence or peer relay. Existing gate/socket regression suites run
with the new exhaustive discriminant guard. No DB, server deployment, UI, GPU,
new room format or engine/wire hooks are activated by this unit.

Acceptance at this unit:45 focused admission/gate/real-Socket.IO tests and142
existing room regressions PASS; server typecheck and scoped lint PASS. Map check
PASS, dependency rules0errors:11known warnings plus this intentionally inactive
service and two other agents' not-yet-imported numerical helpers. No fake import
was added to make the closed service appear active. Test HTTP/socket instances
are ephemeral and closed by the harness; no persistent server or DB changes.
