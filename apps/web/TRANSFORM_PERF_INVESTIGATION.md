# Transform-tool lag/freeze/data-loss investigation (#155)

Status as of this note: **content-loss and gizmo-glitch bugs are fixed;
Tier 2 (real per-tile content-bounds tracking, see Session 2 below) is
implemented, tested (292/292 passing), and live-verified — INP on the exact
repro that measured 22.3s dropped to 185ms (Web Vitals "Good", <200ms) on
reload with no other changes.** Not yet committed. Ilya is about to check
tablet + infinite-canvas behavior next — if that surfaces anything, continue
here rather than re-diagnosing from scratch.

## Original complaint

Selecting the Transform tool and dragging content (layer move/scale/rotate)
made `pointerup`'s Interaction-to-Next-Paint spike to multiple seconds —
sometimes 8-10s+ — on the infinite canvas. Diagnosed live via
`chrome-devtools-mcp` performance traces while Ilya reproduced in a visible
browser window (not synthetic benchmarks).

## Root causes found, in the order they were uncovered

1. **`_bakeTransform`/`previewLayerTransform` did an unconditional
   `O(destTiles × sourceTiles)` GPU blit** for every (destination tile,
   source tile) pair, even when their transformed bounding boxes couldn't
   possibly overlap. Fixed with an AABB pre-check that skips non-overlapping
   pairs — **kept, still active**.

2. **`_bakeTransform` allocated a fresh `AccumulationBuffer` (`new` +
   `_makeFBO`, a real `checkFramebufferStatus` GPU sync) for every
   destination tile on every single commit**, then destroyed it right after.
   Fixed by pooling scratch buffers across bakes (`_transformScratchPool` /
   `_acquireScratchBuf` / `_releaseScratchBuf` in `engine/index.ts`) —
   **kept, still active**. Real, uncontroversial win: repeat commits reuse
   already-allocated GL objects instead of re-paying `_makeFBO` every time.

3. **Tried: dropping fully-emptied tiles from residency** (`dropTile` on
   `ILayerBuffer`/`TiledLayerBuffer`) so `getContentBounds`'s per-tile
   `readPixels` + full-buffer JS scan wouldn't keep re-scanning tiles a
   transform had long since vacated. **Reverted.** Two problems:
   - `resolveForPaint` resolves destination tiles from each source tile's
     *whole* `tileW x tileH` extent, not its real painted content. A
     realistic (non-tile-aligned) drag therefore always spills into a
     handful of tiles nothing was ever painted on, and those get a
     "real" blit purely from full-tile-level AABB coincidence — so most
     spillover tiles never qualified as droppable in practice. Verified via
     a unit test replaying an 11-drag sequence captured from a live,
     actually-broken room: resident tile count still grew in a clean
     block pattern (4, 9, 16, 25, then capped at the 32-tile eviction
     budget) with dropTile active.
   - Worse, once tile count hit that budget, **a real, pre-existing
     eviction/read race in `_bakeTransform` surfaced**: `resolveForPaint`
     can call `TiledLayerBuffer`'s own `evictIfOverBudget()` mid-bake,
     which can destroy (GL `deleteTexture`) a tile still sitting in the
     `sourceTiles` array captured earlier in the same call, moments before
     the blit loop reads `srcTile.buffer.texture` from it. This is a real
     WebGL `INVALID_OPERATION: bindTexture: attempt to use a deleted
     object` — **fails silently** (wrong/missing pixels, no thrown JS
     exception), which is exactly what made it easy to ship unnoticed and
     why it read as "content just disappeared" rather than a crash.

4. **Fixed the eviction race directly** (this is real and worth keeping
   regardless of dropTile): `_bakeTransform` now wraps its whole body in
   `TiledLayerBuffer.suspendEviction()` / `resumeEviction()`, the exact same
   mechanism `_replayInto` already uses for the identical hazard during
   checkpoint replay. Verified fixed by replaying the exact 11-op sequence
   captured from the live broken room (`git`/DB — see "Reproduction data"
   below) as a permanent regression test; content survives all 11 bakes now.

5. **Tried: deferring `refreshTransformBounds()` (Room/index.tsx, called
   right after `dispatchOp` in the transform gizmo's `onUp`) off the
   synchronous handler**, first via `requestAnimationFrame` (no net INP
   improvement — rAF still runs *before* the next paint, so the cost just
   moved from "processing duration" to "presentation delay") then via
   `requestIdleCallback` (this **did** cut the measured INP substantially).
   **Reverted anyway**: it left the transform gizmo's outline showing stale
   (pre-drag) bounds for a real, user-visible stretch after every commit —
   confusing ("gizmo not on the content"), and bad enough once that a second
   drag started against the wrong stale bounds. Correctness of on-screen
   state beat the INP number here. `refreshTransformBounds()` is called
   synchronously again, same as before this whole investigation.

## Current known-unsolved problem

Performance for **many repeated non-tile-aligned drags in a row** is still
bad — not correctness-bad (nothing is lost or visually wrong anymore), but
slow. Root cause is architectural, not a quick patch:

- `_bakeTransform`'s destination-tile resolution is based on each source
  tile's *whole* extent, not real content, so a session of repeated
  non-aligned drags keeps growing the resident tile footprint (verified:
  clean block growth 4→9→16→25 tiles after just 4-5 drags in a synthetic
  replay test).
- Once that crosses `TiledLayerBuffer`'s 32-tile eviction budget (very
  realistic within a single test session), eviction+recovery cycles
  (`recoverTiles` → full operation-log replay via `rebuildTile`) start
  firing, and replay cost grows with how many ops are in the log — a
  synthetic replay of the *exact* 25-op sequence captured from a second
  live-browser bug report took **over 9 minutes** end to end (per-bake cost
  climbing from tens of ms to multiple seconds by the later ops).
- Real fix needs `resolveForPaint` (or `_bakeTransform`'s own bounds math)
  to work from a source tile's *real painted content* bounds, not its full
  tile-sized extent — a genuine design change, not something to patch
  blind. Left as a follow-up, not attempted this session.

## What's currently active (uncommitted)

`git status --short` at time of writing:
```
 M apps/web/src/engine/index.tiledTransform.test.ts
 M apps/web/src/engine/index.ts
 M apps/web/src/engine/src/TiledLayerBuffer.test.ts
 M apps/web/src/pages/Room/index.tsx
```

`engine/index.ts` changes still in place:
- `_scheduleDisplay()` / rAF-throttled `_display()` calls in `_onMove`/
  `_onPredict` (from earlier in this same overall investigation, drawing-lag
  side — unrelated to the transform bug, already verified working).
- `_previewBufPool`/`_tipBufPool` + `_acquirePooledBuf` (same, drawing-lag
  side, already verified working).
- `_transformScratchPool` + `_acquireScratchBuf`/`_releaseScratchBuf`
  (transform-bake scratch buffer pooling — item 2 above).
- AABB pre-check in `_bakeTransform`/`previewLayerTransform` (item 1 above).
- `suspendEviction`/`resumeEviction` wrapping in `_bakeTransform`, split
  into `_bakeTransform` (thin wrapper) + `_bakeTransformUnsuspended` (the
  real logic) — item 4 above, the critical correctness fix.
- No `dropTile` anywhere — fully reverted (item 3).

`Room/index.tsx`:
- `engine.setLocked(... || transformActive)` in the layer-state-sync effect
  — prevents drawing and transforming from firing simultaneously (an
  earlier-session fix, confirmed still needed and working: without it,
  stray strokes could land mid-drag).
- `refreshTransformBounds()` called synchronously in the gizmo's `onUp`,
  same as before this session (item 5 — deferral reverted).

Test suite: `npm test` (from repo root) — 292/292 passing, typecheck clean,
`npm run lint` clean, as of the last full run this session.

## Reproduction data (for continuing this investigation)

Two real bugs were root-caused by pulling the *exact* operation sequence
straight from Postgres for the live room that broke, then replaying it in a
fast engine-level unit test (`apps/web/src/engine/index.tiledTransform.test.ts`,
test named `#155: 11 repeated non-tile-aligned drags in a row...`) — this
was far faster and more conclusive than guessing from live traces alone.
Query used:
```sql
SELECT seq, type, "layerId", data->'transforms' as transforms, data->'dabs'->0 as first_dab
FROM "Operation" WHERE "roomId"='<room-id>' ORDER BY seq ASC;
```
(`docker exec art_lessons_pg psql -U art_lessons -d art_lessons -c "..."`)
If this recurs, pull the room's op log the same way rather than re-guessing.

Test room `0U6WPbGs` (created fresh mid-session specifically to isolate this
bug from an older, even-more-poisoned room `y5PP3Pg5`) is now itself heavily
poisoned by all this session's repeated drag testing — its own op log is 25+
`layer_transform` ops, several spanning huge world distances. **Loading it at
all may now be slow** (full-log replay on room join) — this is expected
given the unsolved architectural issue above, not a new bug. Recommend
testing further scenarios in a **freshly created room** rather than reusing
`0U6WPbGs`, and dropping it (or all test rooms) from the DB once done, same
as was done earlier this session (`DELETE FROM "Room"` cascades cleanly per
`apps/server/prisma/schema.prisma`).

## Suggested next steps

1. Confirm live in a **fresh room**: transform tool no longer loses content,
   gizmo no longer shows stale bounds after a commit. This has NOT yet been
   confirmed live by Ilya as of this note (only unit-test-verified) —
   confirm this first before doing anything else.
2. Decide whether to commit the currently-uncommitted fixes above as-is
   (data-loss fix + gizmo fix + the two safe perf wins), documenting the
   remaining slow-repeated-drag case as a known follow-up issue rather than
   blocking on it.
3. If/when tackling the deeper perf issue: the real fix is making
   `_bakeTransform`/`resolveForPaint` reason about a source tile's actual
   painted content bounds instead of its full tile extent — likely needs a
   tracked per-tile content bbox (maintained incrementally on paint, not
   computed via `readPixels`) rather than another blind patch attempt.

## Session 2 (2026-07-14): live trace pinpoints the actual bottleneck, and it isn't what Session 1 assumed

Restarted dev server + web (per this session's request) and reproduced live
in a **fresh** A4 room (`xEYBdyGg`, not infinite — Ilya explicitly asked for
a regular room, infinite canvas not needed for this repro) via
`chrome-devtools-mcp`'s `performance_start_trace`/`stop_trace` while Ilya did
the dragging in the browser himself.

Two traces, both confirming the "gets worse with more drags" complaint:
- Trace 1 (a few drags in): INP **11,228 ms**, 11,140 ms of it processing.
- Trace 2 (a few more drags on top): INP **22,336 ms**, 22,307 ms processing.

Parsed the raw CPU profile (`ProfileChunk`/`Profile` trace events) for the
second trace's longest `pointerup` window and aggregated self-time by leaf
function. Top of the list, out of ~22.3s total:

| Function | Self-time | Share |
|---|---|---|
| `readPixels` (native GL, called from `getContentBounds`) | 12.7 s | 57% |
| `checkFramebufferStatus` (native GL, called from `AccumulationBuffer._makeFBO`) | 6.9 s | 31% |
| `getContentBounds` CPU scan itself (`index.ts:1097`) | 1.2 s | 5% |
| `_bakeTransformUnsuspended` (the actual bake) | 14 ms | ~0% |
| `recoverTiles` (eviction replay) | 11 ms | ~0% |

**This inverts Session 1's assumption.** The scratch-buffer pooling and AABB
pre-check from Session 1 are working — `_bakeTransform` itself is now cheap.
Eviction hadn't even kicked in yet in this fresh room (`recoverTiles` cost is
noise). The actual freeze — ~99% of it — is two other things entirely:

1. **`getContentBounds` (`index.ts:1097`)** does an unconditional
   `readPixels()` + full per-pixel CPU scan over **every resident tile** of
   the layer, every single time it's called. Its own docstring says it's
   "meant to be called once when the tool activates or the target selection
   changes, not per drag frame" — and it *is* only called once per drag
   (via `refreshTransformBounds()` in `Room/index.tsx:820`, on activation and
   after every commit, exactly as designed, see the comment at
   `Room/index.tsx:814-819`). The problem isn't call frequency, it's that
   each call's cost is `O(resident tiles)` with a hard synchronous
   `readPixels` per tile, and resident tile count keeps growing every drag
   (same root cause Session 1 already found: `resolveForPaint`/
   `_bakeTransform` resolve destination tiles from a source tile's *whole*
   extent, not real content — see item 3/the "Current known-unsolved
   problem" section above). So this cost compounds on *every single commit*,
   well before the 32-tile eviction budget is anywhere close to crossed —
   it doesn't need eviction to be slow.
2. **`checkFramebufferStatus`** inside `AccumulationBuffer._makeFBO` (a real
   GPU sync point) fires whenever a genuinely *new* tile is constructed
   (`TiledLayerBuffer.getOrCreateTile`) as the transform's destination
   footprint spills into previously-empty tile-grid cells — same growing-
   footprint root cause, different symptom.

Net: the dominant, measured cost right now is **not** eviction/replay (that
was Session 1's live hypothesis for "the remaining slow case," and the code
comment at `Room/index.tsx:1093` explicitly says "`_bakeTransform`'s own cost
... is where #155's INP work continues instead" — this was wrong, or at
least incomplete, per this session's numbers). It's `getContentBounds`
re-scanning an ever-growing resident-tile set on every commit, plus new-tile
FBO creation. Eviction-replay cost is real too (Session 1 verified it
separately with a 25-op replay) but wasn't what showed up in this session's
live traces — it's a second, later-onset symptom of the same underlying
tile-footprint-growth cause, not the main contributor to what Ilya actually
felt after "a couple of moves."

### Proposed fix

**Tier 1 — quick, low-risk, ships now, targets the measured 88%:**
Cache each tile's local content rect (or "fully empty" flag) on the tile
itself, computed once via the existing `readPixels` + scan, and mark it dirty
only when that specific tile is actually written to (paint dab lands in it,
or a bake blits into it as a destination). `getContentBounds` then unions the
*cached* rects for clean tiles and only pays the real `readPixels` + scan
cost for tiles dirtied since the last call — after a single drag, that's the
handful of source/destination tiles the just-completed bake actually touched,
not the whole resident set. This doesn't touch `resolveForPaint`/tile-
footprint growth at all (so it won't fix `checkFramebufferStatus`'s cost or
the eventual eviction-replay case), but it directly collapses the 12.7s+1.2s
`readPixels`/scan cost down to roughly what it'd cost for 1-4 tiles instead
of the whole growing resident set — likely the single highest-value change
available given what was actually measured. Confined to `TiledLayerBuffer`
(a dirty flag + cached rect per tile entry) and `engine/index.ts`'s
`getContentBounds` loop; testable the same way `residentTileCount`-style
tests already work, no architecture change, no risk to bake correctness.

**Tier 2 — the real architectural fix, larger effort, same as Session 1's
suggested next step 3:** track each tile's real painted-content bbox
incrementally (updated at paint/bake time, never via `readPixels`) and make
`resolveForPaint`/`_bakeTransform`'s destination-tile resolution use a source
tile's *actual* content bounds instead of its whole tile extent. This is what
actually stops the resident-tile footprint from growing in the first place —
it fixes `checkFramebufferStatus`'s new-tile-creation cost too, and removes
the eviction/replay risk permanently instead of just delaying it. Bigger
change, touches the core bake/paint path; Tier 1 is worth shipping first and
independently since it's a strict subset in blast radius and already
addresses the majority of what was measured live.

Recommendation: do Tier 1 first (fast, isolated, directly answers tonight's
repro), keep Tier 2 as the scheduled follow-up architecture work it already
was.

## Session 2 continued: Tier 2 implemented directly (skipped Tier 1)

Ilya asked for Tier 2 straight away rather than landing Tier 1 first.
Implemented, tested, and live-verified in this same session.

### What changed

- **`ILayerBuffer.ts`**: `PaintTarget.contentRect: WorldRect | null` — each
  tile's real painted-content bbox, world-space, integer, or null if the tile
  currently holds nothing. New interface methods: `markContentPainted`
  (union a freshly-painted world rect into every tile it overlaps),
  `clearContentAt` (reset one tile to "no content"), `restoreTileContent`
  (set, not union, from a tile's exact restored pixels — checkpoint/eviction
  recovery), `getContentBoundsWorld` (union of every tracked tile, resident
  or evicted — the new getContentBounds primitive, no readPixels).
- **`TiledLayerBuffer.ts`**: a `contentRects: Map<tileKey, WorldRect | null>`
  parallel to `tiles`/`evicted`, populated/updated at every point a tile's
  real content can change — `getOrCreateTile` (new tile starts null),
  `recoverTiles` (scans the pixels it already reads back for eviction
  recovery — `scanLocalContentRect`, extracted from the old
  `getContentBounds` scan logic, now paid once at recovery instead of once
  per query), plus the four new public methods. Never cleared on eviction
  (content survives exactly as long as the pixels do).
- **`engine/index.ts`**:
  - `getContentBounds` is now a one-line delegation to
    `getContentBoundsWorld()` — no readPixels, no CPU scan.
  - `_paintDabs`/`_paintImage` call `markContentPainted` with the same
    world-space bounds already used to resolve paint targets.
  - `_compositeLayerInto` (both merge paths route through this) forwards
    each source tile's real `contentRect` straight across, since merge
    composites at identical world coordinates (no transform to reason
    about).
  - `_replayInto`'s checkpoint-restore loop calls `restoreTileContent` with
    the checkpoint's own exact pixels (a *set*, not a union — these are
    exact historical pixels, not an approximate paint bound).
  - **`_bakeTransformUnsuspended` and `previewLayerTransform`** (kept in
    lockstep — the live preview must stay pixel-identical to the real bake,
    see `index.tiledTransformPreview.test.ts`): `srcRects` is now built from
    each source tile's real `contentRect`, not its whole `tileW x tileH`
    corners. A tile with `contentRect === null` (vacated by an earlier bake,
    still resident) contributes nothing at all — no longer part of the
    overall transformed bounds, no longer a candidate source for any
    destination tile. This is the actual fix for the growing-footprint bug:
    a long-emptied tile now drops out of every future bake's reasoning
    entirely instead of forever dragging the bounds (and therefore resident
    tile count) wider. `_bakeTransformUnsuspended` also now calls
    `clearContentAt` up front (mirroring the unconditional per-source
    `buffer.clear()` later in the same method) and `markContentPainted` for
    each real (source, destination) blit that actually fires, so tracked
    content ends up exactly matching the real post-bake pixel state without
    ever reading a pixel back.
  - Integer rounding happens once, inside `markContentPainted` itself
    (floor/ceil outward) — every tracked rect stays integer end to end, so
    `getContentBounds`' pre-existing "content bounds are integers" guarantee
    (`_buildContentComposite`'s zero-rounding export-camera placement relies
    on this) holds with no separate rounding step needed anywhere else, and
    the existing pure-translation exact-equality test
    (`index.layerTransform.test.ts`'s "shifts by the exact same offset...")
    keeps passing unchanged.

### Test fallout

One test needed updating, not just re-running:
`index.tiledTransformPreview.test.ts`'s scratch-buffer-reuse perf test
relied on the *old* whole-tile-extent behavior to make its fixture
(a small stroke) "span two tiles" after a small translate — under Tier 2
that stroke's real content never got near the tile boundary, so it
correctly stopped spanning two tiles (exactly the fix working as intended).
Fixed by repositioning/resizing the fixture's stroke so its *real* content
genuinely straddles the tile boundary throughout the drag range being
tested, preserving the test's actual intent (scratch buffer identity
preserved across frames when the real multi-tile set doesn't change).
292/292 passing, typecheck clean, lint clean.

### Live verification

Reloaded the same fresh room (`xEYBdyGg`) with the new code, repeated the
same non-tile-aligned drag sequence that measured 22,336ms INP before the
fix. Result: **INP 185ms** — Web Vitals "Good" (<200ms threshold), roughly a
120x improvement on the same interaction pattern that used to compound into
double-digit seconds.

### Not yet done

- Not committed — these changes (plus whatever was already uncommitted from
  Session 1) are still sitting in the working tree.
- Ilya is about to check tablet behavior and the infinite-canvas variant
  next (this session's live repro used a regular A4 room, at Ilya's own
  request — infinite canvas wasn't tested against Tier 2 yet). If either
  surfaces a regression, come back to this file rather than re-diagnosing
  the already-solved parts from scratch.
- `checkFramebufferStatus`'s share of the original cost (new-tile creation)
  should now also be largely gone as a side effect (fewer spurious
  destination tiles are ever created, since destination resolution is now
  based on real content bounds) — not independently re-measured this
  session; the 185ms result already folds in whatever's left of it.
