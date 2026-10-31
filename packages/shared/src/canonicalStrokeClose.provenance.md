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
