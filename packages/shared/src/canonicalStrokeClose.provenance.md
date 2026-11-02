# Stage A: explicit canonical close data, not authority

The adjacent canonicalStrokeClose module adds the closed request/recorded META
shape and a pure seal law. It uses operationBase and the SAME decoded prefix
summary. It never authorizes a source/read/execution, authenticates a participant,
proves an indexed row, changes material fences, emits pigment, increments an
author ordinal or commits speculative live-only state.

Parsers bound each known scalar before copying. Reflect.ownKeys rejects unknown,
symbol and nonenumerable extras. Own data descriptors are captured once;
accessors are rejected without invoking their getters. Recorded operation parser
REQUIRES a positive authoritative server seq. A local journal ordinal is NOT
that sequence; journal owners must pass original entry.serverSeq placement.
The actor userId and targetUserId are deliberately distinct fields.

Pure verifier consumes an already decoded/verified open prefix summary and an
already verified immutable user/layer/stroke identity. It validates N/first/last,
context and close ordering and returns an immutable metadata seal. Normal author
gestureEnd stays separate. Summary checks compare close ID with the known first/
last frame IDs; global operation-ID uniqueness (including intermediate frames)
and completeness/provenance remain the actual indexed-log owner's law. A caller
can construct data with this shape; it has no read/append/execution authority.
No product32-frame lifetime cap is introduced; a206-frame structural cut works.

Operation union/protocol/index expose this additive schema. Generic server
operation admission reserves close and rejects it even in legacy rooms. NO close
transport producer or socket listener exists in this stage. Paired client ingress
and journal owners are a separate coordinated change, with execution OFF until a
genuine source-prefix seal consumer exists. Canonical coverage remains false;
no snapshot eligibility, close persistence or native whole-stroke claim.

Validation:36 tests/3 focused suites PASS, then63 tests/5 suites PASS including
current root snapshotCoverage/operationGate regressions; shared build74059,
shared TypeScript6986, final server TypeScript94105 and scoped oxlint PASS. Parser mutation/unknown/symbol/hidden/
accessor tests, prefix/end/context/order mismatch and long/single structural
prefix tests are pure metadata checks, not source/DB/device proof. No dependency,
service, browser, device session or persistent temporary resource was created.


## RAM empty BEGIN retirement (protocol8 additive, not activated)

Source base bdef9901f95fd8ceaa8851623309971e62040955. A normal START cancellation/timeout after an emitted BEGIN could retain an empty committed server Session/grant: client abort only settled its Promise, client partial close required actual emitted frames, and disconnect skipped zero cursors. This is bounded resolver quota retention, not a measured production outage or per-stroke artwork leak. BrushStorage.pin deduplicates exact brushes and remains unchanged.

The proposed ephemeral `canonical_stroke_discard_empty` control is separate from positive-prefix recorded close. Its exact own DATA is layerId/strokeId/boardEpoch/emptyDiscardNonce. BEGIN optionally carries the same bounded attempt nonce, captured by Transport before the OLD unchanged source resolver parser; it never enters material, snapshot, source SHA or recorded history. Session pins it. Unknown target produces no tombstone; wrong old nonce cannot retire a newer same-stroke Session. Legacy nonce-less BEGIN stays accepted, but cannot use wire discard. Original exact-Session disconnect cleanup can retire its genuine zero/zero state.

SAME existing socket canonicalTail serializes BEGIN -> discard -> later frame. Retirement requires both liveNext and recordedNext zero, no recordedTail/durable progress, exact current Session/grant/lifetime/epoch, then a callback-free grant+session removal. Progressed state is never deleted. No fake END/close, source grant, new queue/cache/owner, quota increase, room reset or storage unpin is introduced. Failed unrelated DB writes are neither cleared nor treated as proof; empty RAM retirement relies on exact no-progress state and same existing serialized transport rather than writing durable metadata.

The real Room callsite supplies a captured typed sender. Controller requires the SAME socket and original read lifetime. Engine retains the exact service method, captures attempt nonce before final START current checks and marks validated BEGIN synchronously before Promise/FIFO resume. Before-ACK abort/timeout/malformed ACK/emitter throw requests cleanup best-effort without replacing the primary error. Post-ACK cancellation requests it only before any local accepted frame; accepted local progress/normal completion does not emit discard. Cleanup failures are reported, not converted into author success. No retry/outbox is added.

Meaningful same-existing-API RED: old disconnected zero-frame ticket returned no close but its grant still accepted an actual live frame (1 FAIL/127 skipped, 3.26s). The initial launcher did not persist waitpid exitCode; its failed Vitest summary and absent PID are retained, not invented as an exit receipt. V1 GREEN125PASS/3FAIL exposed self-invalidation after deleting captured sessions. V2 GREEN240PASS/1FAIL exposed the real engine constructor dropping the new service method. V3 241/5PASS and both strict gates0 preceded attempt-nonce closure. V4 preserved241PASS/2 test-only ReferenceErrors from fixture rewriting. V5 test-only correction: full243/5PASS45.64s, server11roots95inputs0, web6roots599inputs0.

V6 changes only the Transport nonce projection to use captured own descriptor values instead of rereading raw input fields, plus its direct Proxy/getter test. V6 focused1PASS243skip17.44s, server11roots95inputs0/web6roots599inputs0. Existing pre-auth layerId access remains historical behavior; no universal Proxy sandbox is claimed. Final14TS outputs were all source-hashed; final docs only add this provenance and architecture RPC registration. The full final combined244 suite was NOT rerun in RAM; ROOT will run actual coherent gates after review/apply. Configured lint NOTRUN here. Initial failures and all consumed maps/logs remain immutable.

Tests include real Socket.IO handler ordering with deferred BEGIN, 1025 real BEGIN/discard cycles under actual1024 cap, progressed live/recorded denial, late old nonce vs newer same-key grant, unknown no-future-tombstone, legacy wire no-op and exact disconnect, pure ownDATA parser/accessors, abort/timeout/late ACK and throw preservation, real engine ACK-before-FIFO cancellation and no post-localaccept discard. Socket/DB/GL are test-owned HOST infrastructure; no physical device/latency/source-native-pixel/online deployment claim.

Scope limits: this remains best-effort control over the original current connection/read/paint authorization. Expired/replaced socket/read or revoked authorization may refuse cleanup; no RPC is redirected to a new room/identity and no automatic TTL/retry guarantee is claimed. Existing room/lifetime teardown remains recovery. This unit is not approval for speculative BEGIN prefetch, whose cancellation/expiry accounting needs separate review. Current QA bdef runtime is untouched. No source files, dependencies, worktrees, services, devices or disposable resource parents were created/modified by this RAM preparation; all own jobs were reaped.
