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
