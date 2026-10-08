# #728: source pressure — literal vertex candidate

08.10.2026. Existing isolated branch; no runtime defaults changed.

Past actual Surface same-model native100/GL pressure246 vs243 amplified to alpha197 vs255 by mode11 width2.4388 Q8 levels. This identifies amplification, not the original cause. Current source review found a literal evaluation-order mismatch: GL DAB_VERT consumes quad±0.5, rotates then multiplies radius*2, converts clip as(screen/res)*2−1 and negates y. WGSL consumed±1, multiplied radius, then vector(2,−2)+offset. These are algebraically equivalent but need not have identical Float32 vertex/raster interpolation.

Candidate `diagnosticLiteralStampVertex` preserves the original expression order. Fragment helpers, blend descriptors, attachmentQ8, uniforms and draw order unchanged. Default false. Isolated coverageSequenceOracle only receives this option; main author/replay remains baseline. This is a causal hypothesis, not a completed fidelity fix or measured speed gain.

Checks: default WGSL string remains byte-identical; fragment suffix unchanged; source test1PASS; app TypeScriptPASS; scoped oxlintPASS. Hardware shader compile/output equality pending.

Exact gate OFF then ON: `runEndToEnd({size:100,timeoutMs:180000,coverageSequence:true,coverageSameInputIndices:[9],coverageBlankSelected:true,diagnosticHardwareLinearInputs:true,diagnosticLiteralStampVertex:false})`, repeat final flagtrue. Compare identical tape/paperSHA, selected uniforms, same-input accumulated vsblank perchannel errors and samplepixels. Never expand mode11 transition to conceal pressure errors. If primitive remains mismatched, next probe localUV/interpolation vscontactnoise independently.

Runnable Samsung controller `docs/qa/harness/728-native-end-to-end/samsung-literal-controller.mjs`: CDP9454, actualserial check, ownnewtabs, privateURLfile, HTTPbundleSHA+Finebytes passport, minimum1700MiB before each arm and500MiB abort, noChrome restart/cacheclearing/powerchange. Environment: GATE_URL_FILE,GATE_OUT,GATE_BUNDLE_SHA,GATE_CODE,FROZEN_PAPER_DIR. NoSurfaceaccess.

Preflight15:15 local Samsung SM-T970 MemAvailable1088164kB (~1062.7MiB), below1700MiB. NativeGPU not started; no ownedtabs created. stay_on_while_plugged_in=7 unchanged. HistoricalGPUloss makes this gate unsafe until available memory recovers; do not force restart or close usertabs. This preflight is not a GPU failure or proof ofOOM.
