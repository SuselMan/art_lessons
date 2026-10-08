# Full actual-engine 2×2 GL/MRT × queue batching

This is prepared for root device execution; no hardware data or defaults promotion yet. Uses existing runPrototype original zigzag400 tape (37 points + reverse colour, final paperDry), Fine,1024 canvas, joinedTouch/gradientFibres unchanged. Four arms: webgl1 baseline, MRT baseline, MRT front batching, webgl1 front batching. Presentation batching is deliberately excluded. Existing engine run exposes an optional phase observer; absent observer keeps old behavior.

Build after cherry-picking onto the frozen root revision (old agent source must not be substituted):

```sh
node docs/qa/harness/728-engine-webgl2/build.mjs temp/webgl-factorial-engine
```

Serve the existing trusted harness static tree plus this directory; index requires `?engine=<frozen-run.js-URL>`; no private URL saved. Root controller waits `window.runWebglFactorial`, calls `await window.runWebglFactorial({gpu:true})`, writes returned JSON to persistent temp. Page owns all canvases; run finally disposes engine. No Room/servers/account/network ACK claims.

Wall cohort: all4 arms forward, then reversed (8 runs), no queries. Retain individual initMs/paintMs/phaseMs/queue slice metrics and cold/warm order. Verification/export/Undo/Redo follows timed paint. Compare original tape/code, whole material/export, original operations/control targets, meaningful Undo/exact Redo, actual retained fields, required nonempty roles and GL/lost. Stop on quality FAIL. MRT pairs must be >0 (otherwise no MRT performance claim), expose fallbacks/pixels. Captured working roles are strict too: mismatch is reported, not excused automatically.

Separate GPU cohort: same4 arms, EXT_disjoint_timer_query outer brush (GL1) or brushPair plus fallback brush (MRT), every call, max256 outstanding. Queries only during paint, not verification/Undo/Redo; pending query polling after paint is asynchronous with15s deadline and no gl.finish fallback. Extension unavailable/disjoint/lost/timeouts remain explicit; samples are not total GPU work. Pair query processes P/C together; single brush query processes one field. Median/p90/max+valid counts/call counts disclosed; sums can describe sampled outer intervals only, not whole engine GPU duration. Timer wrapping/stack capture changes CPU submission overhead, so query-cohort paintMs is not the uninstrumented speed benchmark.

Factorial interpretation: calculate MRT delta at original/front schedule and front delta at GL1/MRT; report interaction and every raw value. Do not transfer isolated MRT42% to fullwall or add gains. Browser foreground/real device and frozen code/tape/paper passkeys required. CPU queue slice sums include driver submission/synchronization, not pure JS own time; there is no power forecast.
