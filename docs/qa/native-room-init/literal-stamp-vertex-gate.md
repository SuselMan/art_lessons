# #728: source pressure — literal vertex candidate

08.10.2026. Existing isolated branch; no runtime defaults changed.

Past actual Surface same-model native100/GL pressure246 vs243 amplified to alpha197 vs255 by mode11 width2.4388 Q8 levels. This identifies amplification, not the original cause. Current source review found a literal evaluation-order mismatch: GL DAB_VERT consumes quad±0.5, rotates then multiplies radius*2, converts clip as(screen/res)*2−1 and negates y. WGSL consumed±1, multiplied radius, then vector(2,−2)+offset. These are algebraically equivalent but need not have identical Float32 vertex/raster interpolation.

Candidate `diagnosticLiteralStampVertex` preserves the original expression order. Fragment helpers, blend descriptors, attachmentQ8, uniforms and draw order unchanged. Default false. Isolated coverageSequenceOracle only receives this option; main author/replay remains baseline. This is a causal hypothesis, not a completed fidelity fix or measured speed gain.

Checks: default WGSL string remains byte-identical; fragment suffix unchanged; source test1PASS; app TypeScriptPASS; scoped oxlintPASS. Hardware shader compile/output equality pending.

Exact gate OFF then ON: `runEndToEnd({size:100,timeoutMs:180000,coverageSequence:true,coverageSameInputIndices:[9],coverageBlankSelected:true,diagnosticHardwareLinearInputs:true,diagnosticLiteralStampVertex:false})`, repeat final flagtrue. Compare identical tape/paperSHA, selected uniforms, same-input accumulated vsblank perchannel errors and samplepixels. Never expand mode11 transition to conceal pressure errors. If primitive remains mismatched, next probe localUV/interpolation vscontactnoise independently.

Runnable Samsung controller `docs/qa/harness/728-native-end-to-end/samsung-literal-controller.mjs`: CDP9454, actualserial check, ownnewtabs, privateURLfile, HTTPbundleSHA+Finebytes passport, minimum1700MiB before each arm and500MiB abort, noChrome restart/cacheclearing/powerchange. Environment: GATE_URL_FILE,GATE_OUT,GATE_BUNDLE_SHA,GATE_CODE,FROZEN_PAPER_DIR. NoSurfaceaccess.

Preflight15:15 local Samsung SM-T970 MemAvailable1088164kB (~1062.7MiB), below1700MiB. NativeGPU not started; no ownedtabs created. stay_on_while_plugged_in=7 unchanged. HistoricalGPUloss makes this gate unsafe until available memory recovers; do not force restart or close usertabs. This preflight is not a GPU failure or proof ofOOM.

## Surface hardware result

Frozen21027611 bundle SHAed6b4e5be654fc2b85c872e351e48fdd872748b82c655fb185769cfa177fab52, actual Intel Surface, OFF thenON. Between arms next1700MiB preflight refused at1619MiB; ownOFF tab closed, memory recovered1962MiB, only remainingON started. No usertabs touched. OwnON closed. Minimumduringrun1061.9MiB above500abort. No GPU/GL errors/contextloss.

Exact same full tape JSON+SHA3000d237 and paperSHAaeaef351 in both arms. Main baseline100 reproduces43282bytes/max36 vsGL, author/replay exact0. Main is intentionally unaffected bycandidate, so equal mainhash is a control, not evidence that candidate fixes nothing globally. Actual candidate isolated selectedstamp9: accumulated1byte/max1 andblank1byte/max1, BOTHarms oracle output reports identical. Negative result for this primitive: change not promoted.

Important localization: selectedstamp9 center408.86/365.55,radius45.07; mismatch onlyR at418/407, alpha exact. This primitive cannot cover historicalpressure246/243 coordinate566/396. The originalselected9 plan was too narrow for that pressure site. Next isolate relevant latercoveragecommand (previoussource notes alpha stamp17) or firstpressure-producing primitive; retain recordedcommandinput before fullmodel/artistictuning. CPUtrig diagnosticprepared separately for equalGL/WGSLsin/cos to distinguish raster/interpolation.

Machine-readable summary `literal-stamp-surface-summary.json`; ignored raw under ownworktree `temp/device-runs/native-literal-surface/{actual,on-after-cleanup}/report.json`. Controller permitsGATE_ON_ONLY to resume a refused nextarm after RAM recovery without repeatingbaseline. Not a timingbenchmark, ordinaryRoom400 or wholecandidatefidelity proof.

## Pressure field is transport cost, not pen pressure

Read-only actual `native-coverage-linear-surface-1791422250467.json` chronology: outward WATER_FRONT141 calls atmax104.55908584594727, sourcepressure LINEAR alternating temporaryaNEAREST; inwardcalls142–152 max12. Mode11 reads resulting outwardcost. Thus pressure246/243 concerns the relaxed cost field, not directly stamp.penPressure. A primitive trig test is useful only upstream, not a direct pressure-cost oracle.

Existing frozen210 next callable localization: `runEndToEnd({size:100,stages:'pressure',frontIndex:141,sameInputFront:true,diagnosticHardwareLinearInputs:true})`. This reexecutes native kernel with actual immutable GLinput/coverage for the last outward iteration. Earlier first-front exact only checkedindex1. If141same-inputexact, inspect seed/source or earlieriterfirstdivergence; ifnotexact, isolate actualfront math/sampling first. No newmodel/artistictuning, and no hardwarelaunch for this proposednextgate.
