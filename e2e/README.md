# End-to-end tests

Scenarios in a real browser, against a real server and a real database.
See `playwright.config.ts` for why a browser is the only place they can run,
and `support/room.ts` for how the assertions read actual pixels.

## Running them

```
npm run test:e2e            # all of it, headless
npm run test:e2e:ui         # Playwright's UI mode, for writing a new one
npx playwright test e2e/specs/undo.spec.ts
```

Nothing needs to be running first — the harness brings up its own Postgres
container, migrates it, and starts both servers on ports of its own
(`support/stack.ts`). It never touches the dev server, its database, or another
worktree's.

Two preconditions, both one-time:

- **Docker**, for the throwaway Postgres.
- **Baked paper textures.** `npm run bake:paper --workspace=apps/web`, about
  three and a half minutes. Without them every room opens on the "paper failed"
  overlay instead of a canvas; the harness checks for them and says so rather
  than letting the scenarios fail in a confusing way.

`E2E_KEEP_DB=1` leaves the container standing after a run, so a failing
scenario's state can be opened in psql.

## What is covered

| Scenario | File |
| --- | --- |
| Create a room, draw, see the ink; a second stroke adds to the first | `specs/draw.spec.ts` |
| Undo removes the mark, redo brings it back exactly once | `specs/undo.spec.ts` |
| A joiner sees earlier work, and work drawn while they watch | `specs/peer.spec.ts` |
| Drawing through a dropped connection reaches the server afterwards | `specs/reconnect.spec.ts` |
| A room past the snapshot boundary rejoins from stored pixels | `specs/snapshot.spec.ts` |
| Losing the GPU context and getting it back: the drawing returns, undo still lines up, an interrupted gesture leaves nothing, a peer's stroke in flight is not stranded | `specs/contextLoss.spec.ts` |
| A layer transform resamples as one image, with no source-tile seam | `specs/transformSeam.spec.ts` |
| Smudge works across a tile seam — no dead band down an A4 sheet's x=1024 | `specs/smudgeSeam.spec.ts` |
| Settings shows exactly the version this build was stamped with | `specs/version.spec.ts` |
| A tap on a floating-panel button presses it rather than dragging the panel | `specs/floatingPanel.spec.ts` |
| An empty floating-panel slot opens its chooser on a hold and ignores a tap | `specs/floatingPanel.spec.ts` |
| A finger tapping past a selection puts it down, while a one-finger pan keeps it | `specs/selectionTap.spec.ts` |
| An eraser set to go through layers clears every visible one in a pass, and one undo restores them | `specs/eraseThroughLayers.spec.ts` |
| A copied piece survives leaving its room: pasted into another room it lands in front of the person, into its own it lands in place, and a tab already open picks it up | `specs/clipboardAcrossRooms.spec.ts` |

## What is not covered, on purpose

- **CI.** These run locally only for now. Wiring them into `ci.yml` needs a
  browser download and a Postgres service on the runner, and is worth doing
  once the suite has proved stable on more than one machine (#491 says as
  much).
- **Most touch and pen input.** Playwright's mouse is a mouse. The tablet is
  the target device and its gestures — two-finger pan, palm rejection,
  pressure — are not reachable this way, so §9's device passes still need
  hands. The exception is a single finger: `selectionTap.spec.ts` runs with
  `test.use({ hasTouch: true })` and drives real touch events, because a tap is
  fully described by its own down and up and needs no second finger to be
  itself. Its one-finger drag goes through CDP's `Input.dispatchTouchEvent`
  directly — Playwright's `touchscreen` offers only `tap`.
- **Anything about how it looks.** No screenshot comparison: a grained paper
  canvas would make golden images fail on every GPU that is not the one they
  were recorded on. These tests assert that ink is where it should be, never
  that it looks the same as last week.

## Two traps worth knowing before editing

**Coordinate spaces.** `drawStroke` takes screen coordinates relative to the
canvas; `pickColor`, `getContentBounds` and everything built on them take
canvas-pixel (world) units. The two differ by the camera, which fits a whole
page into the window at about 0.46×. Feeding screen coordinates to a world-space
reader does not announce itself — the reads succeed, they are just of somewhere
else.

**Tests that pass on the first run.** `contextLoss.spec.ts` did, which is not
by itself good news — a context that was never really lost would pass just as
happily. It was checked the other way round: with `_syncBuffersToLog()` removed
from the engine's restore handler, all three tests of the day failed, and they
went green again when it was put back. Worth doing for anything here that
claims recovery works.

**Sampling density.** `maxDarknessOverRect` samples a grid, and the first
version used a fixed one. Two strokes far apart make a tall bounding box, ten
steps put the samples 35 world pixels apart, and a stroke 32 pixels tall fits
between two rows of them: the test reported blank paper over a canvas that
plainly had ink on it. The spacing is what matters, not the count.
