# Actual Room: pressure/path probe (OFF QA)

Frozen source bf24bdd7, Surface, water400 → pigment70. Raw: `temp/device-runs/owner-water-dab-pressure-probe-surface.json`; binary snapshots stage0/1/4/9 are stored beside it. Readback after idle: 5,046,272 bytes (4.8125 MiB), field ledger 23.9375 MiB. GL errors0, no context loss. Own page closed; RAM after cleanup1957 MiB.

The proposed missing source coverage.B seed was rejected: all23 pigment-footprint cells had positive actual B. Minimum pressure0. Wet domain2778 cells; pressure-admitted cells44/72/177/291 at steps0/1/4/9. Path faces148/198/0/938. At step4 stride16, P is exactly unchanged: path support is zero. The ten-step cycle ends after ten front iterations although28 were requested (cap16). Only10.5% of wet domain is admitted at completion.

Float paired flux is positive at strides1/2/1: P nonzero cells24→40,40→63,244→261; max deltas0.018744/0.035943/0.012476. At stride16:110→110, maxdelta0. Sum changes are below8e-8 per selected step; P/C alpha agrees. This is measured preview transport, not canonical fidelity or a conservation theorem.

WARM_COST_PATH ran before READY (2 draws, gl.finish, CPU wall2.6ms). Probe copies perturb timing: carry max37.9ms includes stage9 snapshots. Neither figure establishes GPU compile cost or clean latency. Internal Dry/Undo/Redo exact digest aa995d78220fb24d7691e49d1726a8bd38c070fd05063579c0010c52c8730aad; original SAMEtape endpoint remains untested.

Next distinct diagnostic: COMPLETE_FRONT_CYCLES, default OFF. Repeat complete dyadic cycles until requested pressure iterations finish; actual28 requires30 carry ticks, cap32/40carry. Every tick starts with at most one front then immediate paired carry; ≤8 draws/tick, no initial pressure-only wait. This is not yet wired or GPU-proven. Saved actual dumps cannot predict future pressure without replaying its shader; zero-path observation supports testing, not a promised visual improvement.

## Executable diagnostic packet

Set COMPLETE_FRONT_CYCLES=1 together with MULTISCALE_CARRY=1, INHERITED_CARRY=1, CARRY_PREVIEW=1, FINITE_PREVIEW=1, FLOAT_PREVIEW=1, DIRECT_PREVIEW=1, EARLY_PREVIEW=1 and current source spacing/material rebase flags. Entry reads diagCompleteFrontCycles; installer and runtime reject without multiscale; controller checks the effective exposed flag before input. Computed passport includes completeFrontCycles.mjs. Default remains OFF, allocation unchanged, no extra draw per tick; session extends total ticks only. Finite diffusion clock stays paused until carry completes. Probe may be OFF for the clean movie.

Root-specific qaReuse changes are absent in this isolated worktree: cherry-pick narrow additions preserving root lifecycle callbacks. No whole-file replacement. Runtime9/session3/pure-schedule3 tests passed. Hardware allocation still required.

## First complete-cycle hardware attempt: invalid launch

Raw owner-water-dab-completecycles-surface.json: conflicting DIAGNOSTIC_OWNER_MORPH=1 and DIAGNOSTIC_MATERIAL_REBASE=1 rejected at owner-ready, zero input rows. No candidate performance/quality conclusion. Own target closed, postRAM2045 MiB. Correct next launch is MATERIAL_REBASE=1 with OWNER_MORPH absent. Added CPU launch compatibility check before target creation; no automatic retry.

## Corrected complete-cycle ONE Surface

HEAD08e1690d; raw owner-water-dab-completecycles-corrected-surface.json; new saved tape owner-water-dab-completecycles-tape.json SHA 8177fc625dc1044afcde5141cc5fcd22c80eef4517cb4580f7c6ec42881a571e. Own target closed; post2036 MiB, minimum879. valid=true, errors0/lostfalse. Owner2 actual28front/30carry, ≤8draw/tick CPU contract; CPU carry maximum2.4ms/material0.7ms (submission, not GPU timer). Combined P/C mass5.426470653→5.426470825 (+3.15e-8 relative); support24→2399, combined peak0.0687156. Internal meaningful Dry/Undo/Redo exact af83f417f2d1726a35319d46da9c6cf35d9b4602a90248be58f1a16ba7e20c94. Original SAMEnewtape remains OPEN.

PNG5 visually shows preserved violet core with faint lateral spread, not dramatic broad flow or artist-ready proof. Filmstrip and float readback perturb timing; no same-packed hardware A/B or whole performance claim. Images: temp/device-runs/owner-water-dab-completecycles-corrected-surface-morph-{0,1,5}.png. Next analysis should quantify visible radial growth versus mass support, avoiding arbitrary coefficient/dose boosts.

### Visible radial attribution (RGB, not material mass)

Stdlib analyzer analyzeVioletRadial.py excludes neutral paper by violet chroma ((R+B)/2−G). Threshold5: initial108ms pixels319/integral5759.5/variance41.97px²; firstcarry146ms584/23787/67.21;1203ms2122/31972/309.18;2103ms2421/26185.5/329.23. Thus visible low-contrast support and radial spread increase, while concentrated threshold20 integral drops22240.5→7962.5 fromfirstcarry→2103ms. First material reconstruction multiplies RGB contrast roughly4.13 although mass is fixed: display representation/normalization differs from retained initial raster. Do not interpret chroma as premultiplied pigment mass.

Handoff166ms threshold5 integral21872 and variance310.34; endpoint not reached. These are SAME actual owner timeline, not original SAMEtape canonical reference. New original endpoint comparison remains OPEN, so no canonical contrast conclusion. No coefficient/mass boosts proposed.
