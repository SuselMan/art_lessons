# Exact cold canonical gesture prefix (2026-10-31)

The existing snapshotStore query owner reads ONE exact room/user/stroke canonical
prefix through the caller's captured durable cut. It uses the indexed projection,
seq ASC and pages of64, not the unrelated newest64 room-operation window. Page64
is an I/O batch size, not a gesture lifetime or required packing contract. Strict
advancing seq/unique IDs reject out-of-order, repeated/nonadvancing and out-of-cut
mocked replies instead of sorting them into evidence. Required known frame anchors
must match exact immutable id/seq/ordinal/context; empty/changed anchors failclosed.

Every actual indexed row is verified BEFORE projection/copy. Only bounded known
header/frame fields reach a normalized UTF8 size walk; unknown extras reject,
packed strings and fixed RGB/composition scalars are bounded first. The existing
4MiB total budget is checked before retaining each immutable row. Nothing adopts
these query copies as resident durable receipts. No extra registry, queue, table,
RPC, personal library lookup or material parser was added. Material authority still
comes from the existing ROOM-pinned resolver and SAME shared decoder.

canonicalRecordedPrefix is pure decoded metadata. Its transition is reused by
existing admission, preserving the lane fingerprint/duplicate/recorded-end law.
The complete verifier checks ordinal0..N-1, ordered unique operation IDs/seq,
cross-frame phase/group continuity and no frame after normal gestureEnd. Open
prefixes return open. Material/context validation remains the caller's existing
shared decoder responsibility. No codec/source/renderer math was copied.

Transport replaces count/newest64/QA32 with exact paged evidence at the captured
cut, retaining existing flush/write-fence/lifetime checks, actual resident identity
cross-check, ROOM-only saved-context binding and synchronous pin/publication.
Resolver's obsolete32 cap is removed; normalized bytes still bound work. Temporary
bounded ID lookup and decoded fence summaries are local verification work, not a
second retained journal. Existing admission remains the retained session state.

Focused integration uses the real author/adapter/encoder, existing transport and
persistOperation create payloads through mocked Prisma, then the REAL paged query.
A legal forced-cut >32 stream survives unrelated logged operations, cold open
resume, final record and cold recorded-end replay. Removing first/middle/known
last rows or returning out-of-order rows rejects. Query tests cover202 legal-row
pages, exact cut, anchor identity, malformed indexed fields, extras, byte limits,
nonadvancing pages and DB failures. These are mocked DB integration receipts,
NOT actual physical PostgreSQL durability. The independent retained native-packet
consumer uses diagnostic per-yield flush,
with more than32 frames; the corrected source0x5002 receipt has206 frames and9
placements. Those are chosen cuts, not an intrinsic production frame count; this
unit did not drop or rechunk packets/fences and claims no native raster parity.

Completeness is UNDER the trusted DB query contract and captured durable cut.
A known anchor makes missing prior frames/known tail observable; this does not
prove that every trace of a gesture or an unknown terminal tail was not deleted
from the entire DB. Normal gestureEnd is reconstructed; explicit partial-close
META, read/undo whole-gesture target recovery, closedAt(cut) snapshot coverage,
physical storage and active editor remain separate gates. No coverage/pruning,
UI/engine/source guards or production services were enabled.

Final validation:143 tests /10 shared+server suites PASS (maxWorkers2), including
actual socket.io begin/recovery/backpressure/lifetime tests adapted to the exact
ASC query. Scoped oxlint/diff PASS. Shared build90296 PASS; common web app+SW1345
PASS with new shared exports. Final server TypeScript9404 PASS after socket
fixture migration. Tests clean their temporary BrushStorage directories and
socket servers; no persistent runtime/browser/dependency/service resources remain.
