# Explicit original mip-level plans

Internal prerequisite only: no index/UI/server caller selects a subset yet.
Omitting requiredLevels preserves the complete existing pyramid/default behavior.
An explicit requirement identifies the complete canonical asset crop and original
pyramid indices; it never changes native scale selection or source authority.

The planner invokes the SAME nativeImageBank metadata path then filters canonical
jobs without renumbering indices or rewriting keys. Exact own data fields and
bounded, unique, integer nonnegative/non-minus-zero indices are captured before
reader/pixel/GL work. Every unique input crop needs one requirement; unknown or
conflicting crops are rejected. Repeated identical inputs may reuse one requirement.
Input<=256, selected jobs<=4096, existing GPU16MiB/CPU4MiB caps remain unchanged.
Selection metadata is bounded transient planning data; no additional retained
registry/ledger exists. Existing512B/job conservatively accounts retained job/key/
reader metadata, and existing sequential workspace estimates account pixel work.

isReady/resources/preparedResources/lease describe all committed jobs in the
selected plan. assertRequiredSourceBinding is an explicit subset-only query;
assertSourceBinding still requires the full theoretical pyramid. Neither query
mints source permission. Existing bank generation and original owner checks remain.

Additive extension retains the same committed Maps and original readers for
already present keys. Only new original keys get the incoming reader. Existing
reservation, union lease, prepared-publication/publish/finalizeCleanup, rollback,
context-loss and post-publication cleanup semantics are reused. Reset alone
changes bank generation. No source-image bytes or alternate mip cache are retained.

Tests use the actual Basic6 rectangle150²/crop53,53/CAS256 and Graphite128²/7frames
metadata. The patterned inverse-gray test bytes are synthetic, explicitly not a
new native/GPU proof. Full Basic6 budget489928bytes/10jobs; original indices5..9
budget816bytes/5jobs. Graphite indices5..10 across7assets budget13832bytes/42jobs.
Selected RGBA planes are compared byte-for-byte with the SAME full-bank prepared
planes. Extending Basic6 with original index0 adds364816bytes while preserving old
keys/textures/readers and generation. Cancellation/failure/budget/loss remain owned.

Tests-first RED5/5 recorded in R52/image-bank-required-level-red.log: old full plan
ignored selection, unknown indices did not reject, subset query absent. Final
focused/type/lint outcomes are reported with the reviewed commit. No whole runtime
memory saving, changed accepted recipes, new pixel oracle, or GPU timing is claimed.

Final checks: 48tests/4suites passed with one worker (new5 +existing43), including
104 pinned full-bank RGBA levels. Targeted app-config noEmit typecheck passed;
scoped lint0 and diff check passed. Logs R52/image-bank-required-level-green.log
and image-bank-required-level-targeted.log. The first post-implementation run had
three test-fixture failures (nonhex Graphite test ID and vi.fn(existingMock)
sharing the original spy); correcting fixtures made the SAME production pass.
Those are not additional production RED witnesses. No full app/common gate is
claimed by this prerequisite. No temporary runtime/process/device resource remains.
