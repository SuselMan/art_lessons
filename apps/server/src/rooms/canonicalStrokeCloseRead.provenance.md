# B2a: indexed close evidence; execution/read delivery remains OFF

The existing target prefix query now reads one ordered ASC paginated frame OR
close selector at the same captured cut. Frames select top-level original author
and frame.strokeId; close selects data.targetUserId/data.strokeId, retaining its
actual top-level actor. It does NOT query a latest close independently, sort rows
to manufacture proof, infer authority from counts or introduce a lifetime32 cap.

Actual close rows use the SAME bounded shared closed parser and full indexed
identity/body verifier before normalized bytes/retention. Existing page64 and
aggregate4MiB include metadata bytes. The existing temporary IDs set covers both
kinds; frame ordinals remain0..N, strict seq spans both, known frame anchor matches
exactly, N/first/last/target/layer must match, at most one close and no post-close
frame. Pagination continues after a close at a page edge. Frame arrays stay FRAME
ONLY; optional close evidence carries immutable operation + its actual indexed
row. No receipt is fabricated/adopted from that projection.

The SAME resolver decodes frame rows under ONE pinned ROOM source/profile/context,
verifies normal prefix, then verifies actual close evidence separately. It returns
normal material summary plus optional immutable closeSeal. It NEVER changes
summary.ended or fabricates gestureEnd/material frames. Close source read is V2
only; historical materialV1 behavior is not reclassified as a new read grant.
The class seam still requires caller-owned query provenance, permission and
captured current lifetime; a matching operation/row tuple alone grants nothing.
No personal brush authority, pin/import/write/session/append grant is added.

Conservative C-OFF boundary: SAME prepared read owner refuses ANY resident close
before preparation/finish (including[]/index without frame groups), after initial
read authorization. Actual DB close absent from resident log is caught by the
target query before begin pin/grant or scoped read publication. Matching resident
close also refuses cached begin session. A close operation supplied to finish is
refused even if not resident. HTTP operations refuses close-only or mixed pages
before either legacy array or scoped payload, and rechecks permission after the
query so403 wins over the readiness409. Genuine legacy/V1 arrays without close
keep their old shape. No close-bearing-room ready/empty-index claim is made.

Tests use the actual source author/adapter/encoder on the existing explicitly
mapped synthetic soft fixture, BrushStorage ROOM pins, real
internal B1 metadata append and the actual ordered write queue with mocked Prisma
outcomes/rows. The pure read fixture actor differs from target and does not mint
actor permission or an append grant; B2b transport actor authorization is NOT
implemented here. Read tests remove original author, install conflicting reader
personal data, and verify normal-open + separate seal/no mutation/grant. Query
206 zero-draw frames are built and decoded through the shared V2 codec with an
explicit test pin, then verified as an open prefix. This proves framing legality,
not a production minimum, imported artifact SHA or native whole-stroke/raster
result. Physical DB completeness remains conditional
on the trusted indexed-query/captured-cut contract, not adversarial deletion of
all traces or actual Postgres durability proof.

Generic history also reserves close by indexed column OR JSON discriminator:
valid close is shared-parser projected immutable before retention; conflicting
column/body cannot be laundered as legacy. Query projection errors preserve the
existing truthful HTTP500 behavior, never a legacy array/false empty success.

Validation:215 tests/9 suites PASS across query, source transports, real socket,
route, persistence and replay-loader regressions. Final server TypeScript39485
and scoped oxlint/diff PASS. Existing query mocks assert the new exact selector;
row identity/cut checks were not loosened. No shared build/web typecheck needed.
Tests close socket/HTTP instances and delete BrushStorage temp dirs in finally;
no persistent runtime, dependency copies, browser or device resources retained.

Remaining: B2b producer still ABSENT. Actual actor/expected-tail close publication,
cold admission hydration, true C execution-prefix owner and live-only reconcile
must be paired before these close-bearing reads can open. No socket listener,
renderer/controller or source/editor activation was added. Snapshot coverage
remains false; historical closedAt(cut) fold is separate.
