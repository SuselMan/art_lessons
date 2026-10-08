# 36 measured methods: status refresh08.10.2026

Statuses refer to named candidates, not exhaustive research. Historical source/metrics6aa14a43 preserved; no new numbers invented. validated ≠ production ready.

| Method | Status | Whole/measurement scope |
| --- | --- | --- |
| Engine._onStart | validated | No measured whole-engine percentage. |
| Engine._onMove | implemented | No measured whole gain attributed to this method. |
| Engine._onEnd | implemented | No measured own/whole gain. |
| Engine._paintDabs | validated | CPU micro old13.969→2.775ms is not whole/device FPS. |
| Engine._finishRibbonStroke | implemented | No own-method hardware gain. |
| Engine._startSettle | pending | Not measured. |
| Engine._completeSettle | validated | Specific DOWN readback upperbound; not FPS/whole%. |
| Engine._diffuseFieldFor | implemented | No robust whole gain established. |
| Engine._display | pending | Not measured. |
| Engine._displayIfNotSuspended | pending | Not measured. |
| Engine._resolveWithinSheet | pending | Not measured. |
| Engine._enforceGpuBudget | pending | Not measured. |
| PointerInput._handleDown | pending | Not measured. |
| PointerInput._handleMove | pending | Not measured. |
| PointerInput._handleUp | pending | Not measured. |
| Queue.start | pending | Not measured. |
| Queue.tick | validated | Observed replay range5.3–9.7% GL1; not universal. |
| Queue.advance | validated | Shares Queue.tick result; do not add percentages. |
| Queue.complete | implemented | No independent measured whole gain. |
| Queue.scheduleTick | pending | Not measured. |
| Plan.prepare | implemented | No independent whole preparation gain. |
| Passes.fieldOp | implemented | Carry MRT exact; sampled GPU95.65→65.34ms, no whole gain. |
| Passes.waterFrontStep | validated | Native operator34% is not GL/Room/whole34%. |
| Passes.wcResample | implemented | No accepted whole gain. |
| Passes.diffuseStep | validated | Native only; no Room400 gain claim. |
| Passes.brushPass | validated | Do not transfer isolated42% to whole. |
| Passes.pigmentColor | pending | Not measured. |
| Passes.gradientField | pending | Not measured. |
| Buffer.clear | pending | Not measured. |
| Buffer.copyTo | validated | Dead colour snapshot: Surface exact whole400;9MiB/0.598ms operator saving, no whole gain. |
| Buffer.copyRegionInto | pending | Not measured. |
| Buffer.readPixels | pending | Not measured. |
| GL.drawArrays | validated | Shared brush/front results, not additive. |
| GL.clear | pending | Not measured. |
| GL.readPixels | pending | Not measured. |
| GL.texImage2D | implemented | No stable whole gain established. |

Rejected variants: CPU contact/workspace no robust whole gain; trig cache/lazy front no clear improvement; GL static paper cache violates exactness; source+live saves73 submits but no robust wall gain. None implies every possible optimization of that method is exhausted.

[Forecast](../728-optimization-forecast-2026-10-08.md), [full factorial](../728-webgl-factorial-surface.md), [history/multiuser gaps](../728-history-multiuser-morning.md).
