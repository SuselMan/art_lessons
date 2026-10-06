# #680: native timing and stock rebuildSpill on Vega

Source frozen f99d43eafc4ef077300eb46ab89b9b43606a605f. Own home snapshot source-file SHA256 verified against VPS worktree; npm ci installed own dependencies. No watercolor source/model changes.

## Native timing

Actual AMD Radeon Graphics (radeonsi renoir ACO), ANGLE OpenGL4.6, Chrome154; A2 landscape3508×2480, DPR1. Native PointerInput synthetic coalesced pen,8legs; source accepted9review flags verified. No GL readback/finish inside timing. Submission/display latency does not prove photon-visible latency.

Size80 densezigzag active median22.2ms (~45Hz), idlebaseline16.7ms (~60Hz); active p95/max22.3ms,0frames>33ms. Handlermax23.1ms. Solveridle15.42s after Up, revealidle24.14s; background max33.4ms(1frame). This is long background completion with mostly stable rAF, not a15s UI blackout.

Purewater active max22.4ms,0frames>33ms; handlermax16.6ms. Solver15.62s/fullreveal24.33s, later rAFmax22.3ms. Native stroke/wetcells verified; transparent dry export0alpha is expected.

Waterthenpigment: one original120s watchdog, then2leg and8leg diagnostics PASS. First driver had unclamped negative elapsed, which can index pathClient[-1] and leave Promise hanging; actual lost error stack was not recovered. CPU negative input reproduces TypeError. Clamp and monotonic timestamps plus callback catch/reject added to test driver, no engine edit. Corrected8leg case PASS GL0/nonempty, solver1.10s/fullreveal9.82s. Both gestures samewash,153nonzero recorded wetcontacts; not foreignwash/equalvolume test. One pigment rAF133.3ms spike.

Corrected burst: three1.2s size80 strokes,150ms Up→Down pauses. Pending990 complete11.2ms, pending949 complete9.2ms; first display14.3/10.9ms. Later active rAF spikes133.4ms and166.7ms; handlermax44.4ms. Medianactive45Hz remains below baseline60Hz. CPUcomplete does not measure queued GPU completion. Longtasks>200ms none, smaller LoAF events exist.

Transparent posttiming canonical PNG controls verify pigmentnonempty; purewater uses positive wetcells/realoperation control. GL0 in all completed cases.

Artifacts ignored on disk: `temp/device-runs/native-perf/` in release worktree, original results80/diagnostic2/diagnostic8/fixed-clock80, Node phase/events, source scripts. Full runtime flags/passport and framephase samples in JSON.

## Stock rebuildSpill

Own home mirror680-vega-stock-e2e, own offset81: web5572/server4572/DB55572/container grafetto_pg_e2e_81. No developer DB/server4536. Stock test body SHA256 5e7c8798d2c7fee055ce6f9fbbde664c628288b944c5887e67ced4da3a3f5f49 unchanged; standard90s settled poll/180s test limit unchanged. Only config AMD preflight + step reporter added.

`E2E_GPU_SLOT=granted E2E_PORT_OFFSET=81 DISPLAY=:0 npx playwright test e2e/specs/rebuildSpill.spec.ts --config playwright.vega.config.ts --headed --workers=1`

PASS40.6s test/48.1s run: five watercolor authors, two browser renderers, undo, late continuation, redo, fresh replay exact hashes; no readPixels-in-rebuild assertions passed. Preflight actual AMD renderer/maxTexture16384/GL0, Chromium151. Stock source runtime flags follow frozen source defaults; native9flags passport is a separate earlier runtime measurement.

Playwright exit0; own browser contexts closed, all own ports free and DB container removed by stock teardown. Run logs/progress/renderer manifest preserved in ignored `temp/stock-e2e/`.
