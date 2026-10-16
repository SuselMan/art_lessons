# Focused undo-v1 room QA

`room.cjs` checks the agreed 16 October water/pigment rules on a **new empty,
disposable 512×512 room**, with two independent identities. It never reuses an
open browser tab or clears existing content. `prepare.cjs` creates that fixture
using the normal `/api/me` and Socket `create_room` interfaces and saves private
owner storage state outside Git. This directory contains no credentials.

Example (run from worktree, after integration):

```sh
QA_FIXTURE_OUTPUT=/private/new-directory node docs/qa/harness/728-undo-v1/prepare.cjs
QA_ENTRY_URL=http://localhost:5384 \
QA_BASE_URL=http://localhost:5384 \
QA_ROOM=<new-room-id> \
QA_DISPOSABLE_ROOM=<same-new-room-id> \
QA_HOST_STATE=/private/new-directory/host-state.json \
QA_OUTPUT=temp/wc-runs/undo-v1-run \
node docs/qa/harness/728-undo-v1/room.cjs
```

Backend defaults to `http://localhost:4558`; override `QA_BACKEND_URL` for fixture
creation. `QA_ENTRY_URL` can be a required access-gateway URL. `QA_CDP`, if supplied,
connects to an existing Chromium but creates and closes **only its own contexts**.
Without CDP this uses explicitly labelled SwiftShader; it proves room/replay logic,
not hardware determinism or performance. Do not pass a personal room id. A run adds
case layers and operation history to its own fixture and is intentionally not
re-runnable there: prepare a new empty room for the next run.

## Assertions

- Overlap retains the undone author's complete water with zero pigment.
- Undo foreign dependent gesture releases retained water, including pure-water input.
- Disjoint foreign gesture does not retain water.
- Latest bridge gesture is fully removed; redo restores exact target pixels.
- Undo → redo without intervening work restores byte-identical target pixels.
- Every checkpoint compares independent clients' full-replay target **pixel bytes**.
- Wet pigment survives eraser, dry pigment does not.
- Undo drying reclassifies pigment as wet at the eraser and restores those pixels.
- Layer-scoped drying leaves the other layer's pigment protected from eraser.
- Rejoin reproduces target; GL and uncaught page errors fail the run.

Material assertions read the effective `OperationLog.layerPixelOps`, not merely
stored source operations. Pixel oracle is `bakeLayerByFullReplay`; therefore these
checks do not alone prove that transient on-screen morph frames display correctly.
The cases intentionally finish earlier puddles before opening new ones to stay
inside the current two-wet-layer envelope. Failure writes `report.json` with the
last passed checkpoints and stack. Contexts/browser are closed in `finally`.

## Remaining coverage

Connected components geometry edge cases and natural dry boundaries belong in
pure resolver tests. This harness covers one simple bridge, not arbitrary graph
combinatorics. Cross-GPU comparison needs the same operation log replayed on real
hardware; do not call two SwiftShader contexts a device pass. No broad room, layer
merge, transform, annotation or performance campaign is included here.

`capture.cjs` uses the same environment to rejoin a completed disposable fixture
read-only. It records all case layers' final target hashes, lengths and GPU identity
in `final-targets.json`, plus a viewport screenshot. Run on the second real GPU
against the exact same fixture and compare targets by `id`; retain differing bytes
only when investigating a mismatch. This script does not draw, dry, undo or clear.
The main runner also saves final dry screenshots and compares live snapshot pixels
to full-replay target on both last layers, beyond comparing replay with replay.

`run-private-fixture.py --fixture <private-folder> --cdp <url> --output <folder>`
loads the local private service URL and rewrites fixture cookies to the QA host
without exposing values. `--script no-ghost.cjs` selects the focused regression.
`--dry-live` with capture is an explicitly **mutating** check on the disposable
fixture: append layer drying, await confirmation, then compare each live snapshot
with full replay and save both hashes. Without that flag capture stays read-only.

`cleanup.cjs` deletes only a `prepare.cjs` fixture using its owner's normal API.
Set `QA_FIXTURE_OUTPUT` and `QA_DELETE_DISPOSABLE_ROOM` to the exact own fixture ID.
Run after contexts close and after evidence is saved; it never enumerates or
bulk-deletes arbitrary rooms. Private auth stays outside Git; remove it manually
when no more rejoin checks are needed.

`midstroke.cjs` checks one real local pen gesture split by a peer's layer Dry,
then another local gesture before recording its own operation. It requires a
fresh disposable fixture and the same private environment as `room.cjs`.
Run sequentially after other device QA: it owns two independent contexts and
closes both in `finally`. Prefix commit must be acknowledged before Dry;
presentation idle is awaited only after pen-up. The pixel check reads actual
live layer tiles before invoking the independent full-replay oracle. It does
not add a final Dry operation which could mask an incorrect boundary.

Cold rejoin probes now use `history-ready.cjs`: fetch the complete small fixture
history through its normal API, wait for **all IDs including meta operations** in
`_log.entries`, and wait for snapshot repairs/rebuilds. `roomContentReady` and
engine idle alone do not cover the background history walk. Causal states and
effective operations are asserted separately against the unchanged live peer,
so readiness never waits for a desired answer and hides a restoration bug.

`scoped-dry.cjs` checks another layer's drying against freshly renewed wetness,
records the actual water→eraser age (must be below 120 seconds), then checks
hide→show drying, erasing and undo eraser. Its cold rejoin also compares history,
effective material and live bytes captured before the full-replay oracle.
