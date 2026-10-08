# OFF bounded progressive turns

New OFF diagnostic `diagnosticProgressiveQuantum:{maxOps,cpuBudgetMs}`; runtime `runner.setDiagnosticProgressiveQuantum(config|null)` only while idle. Suggested Surface8ops/4ms, permitted1..16ops and budget(0,12]ms; requires progressive mode. Existing grouped submission/progressive incompatibility unchanged.

Each original job.op still executes in its own runQuantum and original Q8 order. Batch stops at first actual planner preview (unchanged150ms throttle), maxOps, CPUbudget or retirement. It then yields one presentation opportunity. CPUbudget cannot preempt one long operation and does NOT bound queued GPU time; maxOps is an independent hard scheduling cap. Metrics disclose actual maxCPUturn/ops/turns/yields. GPU/math/source/preview formulas untouched. Active-gesture chunk boundary remains synchronous; begin/replay busyguard, drain, finish/composite afterallops and disposeonce retained. Retire interrupts pendingframe and never fabricates pen-up.

CPU12 tests pass, including7sameops+sourcecommands7→3yields, same finalfinish order, beginblocked, boundedcancelonce and invalidbudget/serial rejection. Strict capturedharnessTS and scopedlint pass. Actual compactGPU gate compares oldprogressive and8/4 withsamefield/source/paper; softwareexecution may be CPUheavy. No hardware claim or defaults promotion before root gate.

Existing `docs/qa/native-progressive` exposes `await window.boundedGate(true)` for full1536 hardware; false is compactQA-only field allocation with explicitmetadata. It returnsfinalALLRGBA diff/hash, realintermediateframes, blocked andschedulingmetrics.

RealPointer400 existing capturedperf helper: preparePointerPerf400(), setPointerPerfQuantum(null) or {maxOps:8,cpuBudgetMs:4} BEFORE pen-down; drive same realCDP settings/eventorder, drain andtakePointerPerf(). Compare OFF/ON order and cold/warm separately; primarytimeline has no GPUreadbacks, nofirstvisibleproof. takePointerPerf adds progressiveMetrics. Cache/model flags remain unchanged; use actualrootcontrolledSurface only. Final byte gate plus realrelease→idle fairness both required.

Completed compact software actual-kernel gate:75 originalops, final diff0/max0/hash2f971e15 both arms, errors[], beginblockedtrue. Turns/yields75→11 (max8ops), three distinct bounded actualmaterial previews including final. Fixed64² paper/size20 stroke and compact settle extent are scheduling QA, not production1536/fullpaper/device quality. Software run CPU/GPU took minutes; no performance inference from it. Full1536 and realPointer400 are root hardware gates.
