# Dead colour snapshot: actual GL whole gate

Actual existing engine harness with diagnostic options; no alternate solver. Build:

```
node docs/qa/harness/728-gl-colour-snapshot/build.mjs temp/gl-colour-snapshot /path/to/existing/baked/paper
node docs/qa/harness/728-gl-colour-snapshot/check.mjs
```

SwiftShader software only. Serial OFF/ON fresh owners; single400 and mixed400, Fine paper,2048×1024 page to reach production half-resolution condition. Canvas remains1024viewport. Fixed three-dab400straight stroke. Mixed adds a second different-color stroke to SAME wash ID; its candidate flag turns on only when that second stroke starts, so the first single-color phase cannot inflate the mixed-negative-control skip count. Canonical fields, material tiles, exportedRGBA and tape SHA compared separately; skip counters must be positive single and zero mixed. Exact field capture includes retained canonical tile roles and all working slots after dry, not every intermediate iteration. Excludes undo for this bounded gate; ownership/rebuild/abort command proofs are separate CPU tests.

Paint wall excludes readback/export. SwiftShader time is not a hardware speed estimate. Each engine idle has the existing90sec timeout; controller does not alter scheduling, shader constants, quality or the physical model to complete the gate. Partial completed-arm reports are saved after each arm, failure is not reported as parityPASS.

Trusted standalone page exposes `window.runColourSnapshot({backend:'webgl1'})`; it owns only its canvases/engine and calls sequential OFF/ON arms. No automatic GPU run on load.
