# Samsung: night QA, 6 October 2026

Refs #680, #689 and release track #314 §§9, 11–12.

The tested dev engine was commit `3d582373`, served on the isolated port 5308.
Its engine SHA256 (`02a46147059be325b54748ec070b10a8e1df96699b78d2d44ca727e28ce8771f`)
and shader SHA256 (`d6928e5c49342a1ec16f47f4ee7fa9c4cbb9befd010e29fd7f833d975148bdd8`)
match production merge `16c096af` exactly. This identifies the code under test;
the measurements below came from the real tablet, not a VPS rasterizer.

## Functional restore

Galaxy Tab S7+ SM-T970, Android Chrome, Adreno 650. Two actual pen strokes,
27 decoded dabs each, were acknowledged by the server. Dry, Undo and Redo
kept the context alive and left the old water field dry.

A fresh participant joined through the actual name form. Its whole 1754×2480
transparent export matched the author after Redo exactly: 15,797 painted
pixels, decoded RGBA SHA256
`24ff1b43bf07b15d743817f1257b97e56e715e03bbc04c8e42140a3efce74140`.
GL error was zero, the context was alive, and paper wetness was zero.

Raw operation arrays had five versus four entries. This was not lost paint:
the server deliberately omitted the transient `paper_dry`, aged 491,342 ms,
after `WATERCOLOR_WET_DRY_MS = 120000` (`snapshotCoverage.ts`). All four retained
payloads and authoritative server sequence numbers 1, 2, 4, 5 matched.
Local log `seq` values were renumbered. Both raw evidence and the corrected
semantic comparison were retained. This fresh join occurred after the Dry
expiry; it does not replace the separate Vega tests of the ordered barrier
before expiry or of operations arriving while the context is lost.

## Salted shader compile/link

One owned page prefixed every shader source with a unique comment before
engine construction, bypassing the usual source-keyed program-cache reuse.
All 52 supplied shader sources and all 26 linked programs succeeded; no lost
context event, GL error or JavaScript exception was observed. The visible
page loaded the real paper. Individual link/status intervals were 1.2–9.4 ms.

This checks this source on Adreno. It is not a promise that every lower-level
driver cache was empty or that every future shader will compile safely.
No browser cache was deleted and Chrome was not restarted.

## Real input and frame intervals

Portrait canvas 854×2598, DPR 2.125, camera zoom 0.428586 and angle zero.
The existing device library called the engine's actual `PointerInput`
handlers, with two coalesced samples per rAF and a one-second short zigzag.
Server acknowledgements and newly recorded strokes were checked separately.

| Brush | Active frames | Active maximum | Active >33 ms | Tail maximum |
|---|---:|---:|---:|---:|
| 80 px | 60 | 17 ms | 0 | 50 ms |
| 240 px | 58 | 50 ms | 2 | 67 ms |
| 80 px, later guarded repeat | 56 | 67 ms | 2 | 34 ms |

The later repeat restored a room containing the two preceding test strokes,
so it is not a paired timing comparison with the first run. Every tested
gesture recorded its own operation, and no interval exceeded 100 ms. GL
errors remained zero. Asynchronous settle completion took approximately
2.9–4.4 seconds in these small cases. This is an rAF measurement, not
pen-to-photon latency or a landscape/large-wash performance claim.

## Withdrawn idle measurement and harness guard

The first performance attempt changed only the engine tool without checking
Room's store-driven draw gate. No operation was added. Its
apparently perfect 60 Hz result was therefore an idle measurement and was
explicitly withdrawn, not counted as successful drawing.

`pageLib.stroke` now rejects a blocked, unloaded or lost engine before the
test; it also requires the gesture's own `strokeId` in the log before
returning timing metrics. Another participant's operation cannot satisfy
that check. On the real tablet, selecting Hand rejected the benchmark with
no new operation, then selecting Watercolor recorded one operation and
returned valid timings with the same guard installed.

All owned tablet pages were closed. Existing user tabs, power settings,
router configuration and credentials were left alone. These checks do not
claim cross-GPU pixel equality, a long Samsung soak or Samsung context-loss
coverage.

Raw artifacts remain under `temp/device-runs/` in the release/QA worktrees,
and `temp/context-loss/` in the context-restore worktree; they are intentionally
not part of this documentation commit.
