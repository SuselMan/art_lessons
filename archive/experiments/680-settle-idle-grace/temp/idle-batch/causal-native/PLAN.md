# CPU-prepared causal native burst trace

Physical source7322a325, queue idleBatch=false (9eb correctnessbase plus unused
experimental scheduler). No application, shader, model or chronology edits.

After explicit rootGPUhandoff: one headedChrome, native80 burst3×1.2s/150ms,
120s Nodewatchdog/finally close, nineactualflags/AMD/sourceSHA gates. Preserve
prior results by using a new outputdirectory. No additional simultaneousChrome.

Suggested env: PERF_GPU_SLOT=granted PERF_IDLE_BATCH=0 PERF_GL_CALL_TRACE=1
PERF_SCENARIOS=burst PERF_SOURCE_MANIFEST=temp/idle-batch/source-manifest.json
PERF_EXPECTED_SHA=7322 APP_URL=https://192.168.1.70:5321.

run.mjs loads glCallTrace.js then pageBench.js. Original selectedGL methods
forwarded exactlyonce with originalthis/arguments/result/exception. Wrappers add
no GLcalls/readbacks/finish/flush. Aggregates and top30 >1ms stacks are JSAPIwall,
including driver waits, not pureGPU time. Clocks/metadata/stackcapture overhead
reported; observer failures are saved and gated. No subtracting overhead from
nativeFPS. All wrapped functions restored before posttimingcanonicalexport.

rAFtimeline, handler at/ms, completeSettle at/ms, slowGL at/ms/cpuScope/pendingOps
share performance.now clock. This can distinguish mainthreaddriver wait inside
existing API from a later RAF blackout after lowCPU submission; it cannot measure
photon latency or establish queuedGPU time if all APIcalls remain short.

cpu-proof.mjs checks no addedcalls, originalthis/return/throw,30storagecap,
restoration, observer-error containment. CPUproof/syntaxPASS. GPU notrun yet.
