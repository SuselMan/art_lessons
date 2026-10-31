# Restore-owned replay gate (2026-10-31)

The existing ReplayGate has one held array, one scalar read cursor during drain,
one current restore ticket and one transient delivery slot. No extra queue,
registry, room epoch or wire schema. begin replaces the owner; end requires exact
ticket identity and refuses old, copied, foreign, consumed and nested attempts.

The gate stays closed throughout release. Its existing handler receives an opaque
internal per-event delivery token; the confirmed handler forwards that token to
hold using the exact original normalized payload retained by its lexical read
proof. Only that gate/payload/inflight token can bypass hold, exactly once. Normal
wire arrivals, including the same primitive or same object, have no token and
append behind the remaining events. Tokens close on handler exit. Copied, foreign,
wrong-payload, used and expired delivery tokens throw without bypassing the gate.

Drain captures the handler and checks owner/handler before each event and after
the last. A reentrant begin(B) interrupts end(A), preserves B and the unprocessed
old remainder before new arrivals, and returns false to A. The cursor advances
before calling the handler; a thrown handler may have partially applied the
current event, so it is consumed without implicit retry. The unprocessed remainder
is preserved failclosed for a new restore. One finally splice removes the prefix;
there is no repeated shift cost on a long restore queue.

restoreRoomState captures its own ticket at the existing begin point and requires
successful end before sync/ready/cursor publication. An exact local superseded
completion is expected cancellation: it balances its display suspension but does
not publish an apply failure, incomplete flag, ready state or open timing over the
newer restore. Actual render/transfer failures retain their existing reporting.
An ignored begin from holdReviewArrivals remains a deliberate hold; the subsequent
restore's begin becomes its owner. There is no unowned end fallback.

49 focused tests in replayGate, actual restoreRoomState and confirmed stream
suites PASS. Coverage includes ticket identity, nested begin/end, handler change,
new arrivals, scalar/same-object values, delivery identity, consumed ambiguous
throw, retained B owner, exact real canonical held payload release, and two actual
restore calls yielding on the same engine/gate with balanced display counters.
Scoped oxlint and diff check PASS. Combined TypeScript coordinated separately.

Actual straight editor/source routing stays OFF. This closes gate release
ownership, not general cancellation of every legacy restore operation or full
production renderer/author readiness. No services, browser contexts, dependency
copies, new processes retained, push or deployment.

Final expanded regression run: 75 tests / six suites PASS. Combined web app + SW
53637 PASS covers ticket/delivery API, production restore and overlap tests; the
last runtime-only !ticket condition and Reflect.apply null/noarg assertions were
also checked by the final focused run/lint (no subsequent type/API change).
