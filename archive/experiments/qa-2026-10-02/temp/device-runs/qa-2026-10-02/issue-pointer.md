QA 02.10, main 8990c479, QA worktree, Chrome 154 / AMD laptop. Related historical #187/#517, but this is a fresh captured reproduction.

During a pen stroke (pointerId=7), a native mouse move (id=1, buttons=0) reaches the same canvas. PointerInput logs the mismatch and still forwards the sample to DabSystem. The mouse hover becomes a painted diagonal and is recorded in the shared stroke. `_handleUp` likewise logs a foreign pointer then finishes the pen stroke; a palm cancel can truncate it.

Reproduction on a real headed browser: start `__mt.stroke({pts:[[.35,.5],[.65,.5]],ms:2000})` through the device bridge (generated pen input), wait until `_activePointerId===7`, move the native mouse through Playwright/CDP to (451,201) then (901,201). Expected: horizontal pen stroke only, world Y=1240. Actual: native events id=1/buttons=0 enter continueStroke at world Y=460.303; the complete recorded gesture contains 1281 dabs, world Y=460.303…1240.644. This is controlled mixed-source input, not a claim that a hardware stylus was manually used today.

Artifacts: `temp/device-runs/qa-2026-10-02/mixed-pointer-before.json`, `mixed-pointer-before.log`, `mixed-dabs.mts`. New ownership unit regressions: 7 FAIL / 1 PASS before the fix (foreign moves, foreign end/cancel, hover; own cancel works).

Expected: only the pointer that opened the gesture can move or end it; hovering without contact must not paint. Preserve diagnostics and own-pointer OS cancellation. QA-003/006, release track #314 §9.
