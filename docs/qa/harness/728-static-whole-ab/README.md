# Surface static cache followup

All measurements were performed by root on Surface; this agent analysed saved evidence only. Runtime defaults remainOFF.

Diffusion primitive (`native-static-diffuse-surface-1791425497575.json`):1536²,171 repeated fixed radius3 AXIS nearest Q8 pigment+wet gate, origin[0,40], paper1024²/scale1, allRGBA exact/errors[]. Prep1.769472ms. AB32 baseline median1.114112ms (min1.048576,p95/max1.245184), cached.786432ms (min.786432,p95/max.851968):29.4% gain. No claim for every knight/dyadic radius. Shared helper now labels diffusion/pass accurately and exposes actual parameters; older raw limit strings incorrectly called this a front.

Whole100 correctness runs front-only/combined both matched native/nativeReplay/tape/paper hashes to frozenOFF. Front prep1/hits140/fallback22, combinedprep1/hits153/fallback22 (bothowners), noerrors/lostfalse. Timings of these separate runs were NOT fairAB.

Root then alternated combined cache OFF/ON,ON/OFF,OFF/ON in one page (`native-static-ab-surface-1791425709156.json`). All native/replay/tape hashes equal; noerrors/lost. After excluding initialpair, warm author937.60→861.25ms/replay922.75→843.20ms (~8.1%/~8.6%). Raw order and samples accompany report; only2 warm samples/arm, freshdevice compiler/thermal/readbackwall variance remains. This is serialbounded wholejob performance, not visiblelatency, GPUduration or Room.

Admission read-only contract: runner.begin rejects busy; resetGesture mutates shared delivery/scalars/material epoch; planner's pending job references mutable scratch/pool fields. Removingbusy guard would permit data races/state mismatch. In actual factory progressive path, runProgressive awaits rAF after EVERY originalop regardless preview. Many171front/diffuse steps therefore incur seconds of scheduling floor even when primitive GPU kernels are fast. The bounded next experiment groups several ORIGINALorderedQ8ops per turn, retaining actual150ms preview and presentation yields. Keepguard; verify finalbytes and realPointer400 release→idle. Recording/queuing input while busy is separate architecture: must retain original event clocks/settings, CPUwet sampling/deposit chronology, operation order and cancellation; not implement by delayed PointerInput playback or synthetic pen-up.

No model/source/noise change, no nativevsGL quality equivalence, no Room/concurrency claim. Rootcontrols hardware; no additionalrunner or hardware run was created here.
