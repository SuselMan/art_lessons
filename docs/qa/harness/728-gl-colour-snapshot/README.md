# Dead colour snapshot: actual GL whole gate

Actual existing engine harness with diagnostic options; no alternate solver. Build:

```
node docs/qa/harness/728-gl-colour-snapshot/build.mjs temp/gl-colour-snapshot /path/to/existing/baked/paper
node docs/qa/harness/728-gl-colour-snapshot/check.mjs
```

SwiftShader software only. Serial OFF/ON fresh owners; single400 and mixed400, Fine paper,2048×1024 page to reach production half-resolution condition. Canvas remains1024viewport. Fixed three-dab400straight stroke. Mixed adds a second different-color stroke to SAME wash ID; its candidate flag turns on only when that second stroke starts, so the first single-color phase cannot inflate the mixed-negative-control skip count. Canonical fields, material tiles, exportedRGBA and tape SHA compared separately; skip counters must be positive single and zero mixed. Exact field capture includes retained canonical tile roles and all working slots after dry, not every intermediate iteration. Excludes undo for this bounded gate; ownership/rebuild/abort command proofs are separate CPU tests.

Paint wall excludes readback/export. SwiftShader time is not a hardware speed estimate. Each engine idle has the existing90sec timeout; controller does not alter scheduling, shader constants, quality or the physical model to complete the gate. Partial completed-arm reports are saved after each arm, failure is not reported as parityPASS.

Trusted standalone page exposes `window.runColourSnapshot({backend:'webgl1'})`; it owns only its canvases/engine and calls sequential OFF/ON arms. No automatic GPU run on load.

## Software result

Both cases PASS actual WebGL1/SwiftShader: all26canonical/working/paper field records, two material tiles, decoded exportRGBA and tape SHA identical OFF/ON; P/C/water/h/cov all nonempty; GLerrors0/lostfalse. Single ON actually skipped1snapshot:9,437,184storage bytes and2,359,296copy pixels. Mixed ON skipped0: negative control retained the paired snapshot. Compact evidence includes every field SHA/dimensions in `software-summary.json`.

Command/RAF paint wall singleOFF3082.7/ON2989.6ms; mixedOFF5746.8/ON5725.3ms. These values exclude lengthy software-GPU completion readbacks and do NOT establish hardware speedup. The four-arm software run took approximately14minutes overall, with no repeated whole loops. No hardware was used. Expected whole gain remains unknown. Next: fresh serial device OFF/ON, GPU or completion timing separate from readback, all same fields/material gates.

Hardware controller: `CDP_BASE=http://127.0.0.1:9455 GATE_URL=<private trusted page> node docs/qa/harness/728-gl-colour-snapshot/controller.mjs`. Own target only; RAM preflight1700MiB, abort500MiB. Wall arms OFF/ON/ON/OFF are uninstrumented. Separate OFF/ON query arms wrap actual `AccumulationBuffer.copyTo` only during paint, no nested queries, polling/completion/readbacks afterwards. Query values include that copy interval rather than only texture DMA and must be checked for disjoint/counter support; one removed full-field copy is not a whole speedup prediction. Every query arm still must pass all field/material/export gates.

## Surface hardware result

Actual SurfacePro8/IntelIrisXe Chrome154, frozena6ad0eef, GL1/Fine/400/2048×1024. Six fresh owned pages: uninstrumented OFF/ON/ON/OFF then separate query OFF/ON. Every arm passes ALL26field records,2material tiles, decoded exportRGBA and tape SHA; meaningful inputs/nonempty required roles, GLerrors0/lostfalse. ON skips exactly1snapshot/9MiB/2,359,296copy pixels. `surface-summary.json` retains field dimensions/hashes and sanitized valid query rows.

Uninstrumented paint wall:2973.6/2978.0/2999.0/2994.4ms. OFF mean2984.0ms vs ON2988.5ms: no measured whole gain (4.5ms/0.15%slower, one order, not a reliable regression estimate). Scheduling/driver/compiler warm effects remain; wall excludes verification/readback and is not total GPU execution.

Separate valid EXT_disjoint_timer_query copy samples:14OFF copies total4.405620ms;13ON total3.646504ms. The removed1536²snapshot copy was OFFcall10=0.597812ms. The retained corresponding1536²copy was OFF0.618333/ON0.551041ms: other-call variation contributes to the0.759116ms total difference. Thus direct operator saving is measured at about0.60ms for one call, not a universal17.2%copy-stage or whole speedup. A naive0.60/2984≈0.02%wall ratio is only scale context, NOT a strict Amdahl bound: CPU/RAF wall and GPU elapsed are different overlapping clocks. Under memory pressure9MiB less live storage may matter, but no such UX win was established here.

Memory guards: minimum during successful cohort1245MiB, every preflight>=1700MiB, after own pages closed2056MiB. Initial attempt reused one page across fresh engine owners; after its firstOFFarm memory remained1298MiB, so preflight correctly stopped beforeON. That incomplete attempt is excluded. Controller now closes its own page after EACHarm and waits up to60sec for1700MiB recovery. No Chrome restart, native WebGPU work, user-page closure or default change.
