# Indexed restore failure reporting ownership

A failed indexed baseline can cancel its finite read during engine cleanup
before the shared restore catch runs. Finite cancellation still invalidates
execution/progress/readiness. It must not hide a real failure of the original
room/engine owner behind the loading indicator.

The reporting-only guard requires the actual installed engine, original indexed
origin, joined board, and a live original origin scope. It checks the pure Room
refs before and after origin validation, since that external callback can
reenter replacement. Missing guards fail closed. The same guard restricts the
Room wrapper's recovery.failed notification. It mints no grant, generation,
reader, queue or cut; it never permits a cancelled read to continue or publish.
Full and legacy restore validation is unchanged.

Tests exercise genuine original indexed issuers with a sink cancelling the
finite reader before rejecting. The current owner receives apply failure and
replayIncomplete while never becoming ready; replaced engine/origin, changed
board, unjoined state, expired original origin and absent guards do not write
failure state. A current callback replacing owner is rejected by the final
pure check. The real restore hook forwards the guard and tracks its identity.

The existing replay gate retains one latest-begun ticket identity for a pure
`isLatest(ticket)` query. It remains true after its own successful end or failed
drain; a newer begin makes it false. This is reporting generation identity,
not an active gate-owner, delivery bypass, execution or paint grant. begin/end,
queue and drain behavior otherwise remain unchanged. The failure catch checks
latest identity after external origin/owner callbacks. Same-engine/same-origin
supersession is therefore rejected without probing end() or minting a token.
The existing indexed sink receives a third reporting-only closure over that
same ticket; the Room wrapper checks it after owner validation before notifying
recovery.failed. Its execution still delegates the same engine/read unchanged.

Tests additionally cover newer begin while the old sink rejects, newer begin
from an owner callback, and own drain failure after the active owner has been
cleared. The latter still reports apply failure. The gate test verifies latest
identity across normal end, drain failure, foreign tickets and replacement.

This patch does not claim a real-device failure-overlay result or fix every
loading failure.
